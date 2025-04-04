"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useToast } from "@/components/ui/use-toast"
import { nanoid } from "nanoid"
import { io, type Socket } from "socket.io-client"

// Define chunk size (1MB)
const CHUNK_SIZE = 1024 * 1024

export function useWebRTC() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [shareCode, setShareCode] = useState<string>("")
  const [progress, setProgress] = useState<number>(0)
  const [estimatedTime, setEstimatedTime] = useState<number>(0)
  const [status, setStatus] = useState<string>("")
  const [isConnected, setIsConnected] = useState<boolean>(false)

  const { toast } = useToast()

  // Refs to maintain state across renders
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const fileChunksRef = useRef<ArrayBuffer[]>([])
  const receivedSizeRef = useRef<number>(0)
  const totalSizeRef = useRef<number>(0)
  const fileNameRef = useRef<string>("")
  const fileTypeRef = useRef<string>("")
  const startTimeRef = useRef<number>(0)

  // Initialize socket connection
  useEffect(() => {
    // Connect to signaling server
    socketRef.current = io(process.env.NEXT_PUBLIC_SIGNALING_SERVER || "http://localhost:3001")

    // Socket event listeners
    socketRef.current.on("connect", () => {
      console.log("Connected to signaling server")
    })

    socketRef.current.on("disconnect", () => {
      console.log("Disconnected from signaling server")
    })

    socketRef.current.on("error", (error) => {
      console.error("Socket error:", error)
      toast({
        title: "Connection Error",
        description: "Failed to connect to signaling server",
        variant: "destructive",
      })
    })

    // Clean up on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }

      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
      }

      if (dataChannelRef.current) {
        dataChannelRef.current.close()
      }
    }
  }, [toast])

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]

      // Check file size (max 1GB)
      if (file.size > 1024 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 1GB",
          variant: "destructive",
        })
        return
      }

      setSelectedFile(file)
      setShareCode("")
      setProgress(0)
      setEstimatedTime(0)
      setStatus("")
      setIsConnected(false)

      // Reset refs
      fileChunksRef.current = []
      receivedSizeRef.current = 0
      totalSizeRef.current = 0
    }
  }

  // Generate a unique code for sharing
  const generateCode = () => {
    if (!selectedFile) return

    // Generate a unique code
    const code = nanoid(8)
    setShareCode(code)

    // Initialize WebRTC as sender
    initWebRTC(code, true)
  }

  // Connect with a code as receiver
  const connectWithCode = (code: string) => {
    if (!code) return

    setStatus("Connecting...")

    // Initialize WebRTC as receiver
    initWebRTC(code, false)
  }

  // Initialize WebRTC connection
  const initWebRTC = (code: string, isSender: boolean) => {
    // Create a new RTCPeerConnection
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
    })

    peerConnectionRef.current = peerConnection

    // Set up data channel
    if (isSender) {
      // Create data channel as sender
      const dataChannel = peerConnection.createDataChannel("fileTransfer", {
        ordered: true,
      })
      dataChannelRef.current = dataChannel

      setupDataChannel(dataChannel)

      // Join room as sender
      socketRef.current?.emit("join-room", { roomId: code, isSender: true })

      // Listen for receiver joining
      socketRef.current?.on("receiver-joined", async () => {
        try {
          // Create and send offer
          const offer = await peerConnection.createOffer()
          await peerConnection.setLocalDescription(offer)

          socketRef.current?.emit("offer", {
            roomId: code,
            offer,
          })
        } catch (error) {
          console.error("Error creating offer:", error)
          toast({
            title: "Connection Error",
            description: "Failed to create connection offer",
            variant: "destructive",
          })
        }
      })

      // Listen for answer
      socketRef.current?.on("answer", async (data) => {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer))
        } catch (error) {
          console.error("Error setting remote description:", error)
        }
      })
    } else {
      // Join room as receiver
      socketRef.current?.emit("join-room", { roomId: code, isSender: false })

      // Listen for data channel as receiver
      peerConnection.ondatachannel = (event) => {
        const dataChannel = event.channel
        dataChannelRef.current = dataChannel

        setupDataChannel(dataChannel)
      }

      // Listen for offer
      socketRef.current?.on("offer", async (data) => {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))

          // Create and send answer
          const answer = await peerConnection.createAnswer()
          await peerConnection.setLocalDescription(answer)

          socketRef.current?.emit("answer", {
            roomId: code,
            answer,
          })
        } catch (error) {
          console.error("Error creating answer:", error)
          toast({
            title: "Connection Error",
            description: "Failed to create connection answer",
            variant: "destructive",
          })
        }
      })
    }

    // ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("ice-candidate", {
          roomId: code,
          candidate: event.candidate,
        })
      }
    }

    // Listen for ICE candidates
    socketRef.current?.on("ice-candidate", async (data) => {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
      } catch (error) {
        console.error("Error adding ICE candidate:", error)
      }
    })

    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log("Connection state:", peerConnection.connectionState)

      if (peerConnection.connectionState === "connected") {
        setIsConnected(true)
        setStatus("Connected! Ready for file transfer.")

        // If sender, start sending file
        if (isSender && selectedFile) {
          sendFile(selectedFile)
        }
      } else if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed") {
        setIsConnected(false)
        setStatus("Connection lost. Please try again.")
        toast({
          title: "Connection Lost",
          description: "The peer connection was lost",
          variant: "destructive",
        })
      }
    }
  }

  // Set up data channel event handlers
  const setupDataChannel = (dataChannel: RTCDataChannel) => {
    dataChannel.binaryType = "arraybuffer"

    dataChannel.onopen = () => {
      console.log("Data channel opened")
    }

    dataChannel.onclose = () => {
      console.log("Data channel closed")
    }

    dataChannel.onerror = (error) => {
      console.error("Data channel error:", error)
    }

    dataChannel.onmessage = (event) => {
      handleDataChannelMessage(event)
    }
  }

  // Handle incoming messages on the data channel
  const handleDataChannelMessage = (event: MessageEvent) => {
    const data = event.data

    // If it's a string message, it's metadata
    if (typeof data === "string") {
      try {
        const metadata = JSON.parse(data)

        if (metadata.type === "file-info") {
          // Prepare to receive file
          fileChunksRef.current = []
          receivedSizeRef.current = 0
          totalSizeRef.current = metadata.size
          fileNameRef.current = metadata.name
          fileTypeRef.current = metadata.fileType

          setStatus(`Receiving: ${metadata.name}`)
          startTimeRef.current = Date.now()
        } else if (metadata.type === "file-complete") {
          // File transfer complete, save the file
          saveReceivedFile()
        }
      } catch (error) {
        console.error("Error parsing metadata:", error)
      }
    } else if (data instanceof ArrayBuffer) {
      // Received a chunk of the file
      fileChunksRef.current.push(data)
      receivedSizeRef.current += data.byteLength

      // Update progress
      const newProgress = (receivedSizeRef.current / totalSizeRef.current) * 100
      setProgress(newProgress)

      // Calculate estimated time remaining
      if (startTimeRef.current > 0) {
        const elapsedTime = (Date.now() - startTimeRef.current) / 1000 // in seconds
        const bytesPerSecond = receivedSizeRef.current / elapsedTime
        const remainingBytes = totalSizeRef.current - receivedSizeRef.current
        const remainingTime = bytesPerSecond > 0 ? Math.ceil(remainingBytes / bytesPerSecond) : 0

        setEstimatedTime(remainingTime)
      }
    }
  }

  // Send a file over the data channel
  const sendFile = async (file: File) => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== "open") {
      toast({
        title: "Connection Error",
        description: "Data channel is not open",
        variant: "destructive",
      })
      return
    }

    try {
      // Send file metadata
      const metadata = {
        type: "file-info",
        name: file.name,
        size: file.size,
        fileType: file.type,
      }

      dataChannelRef.current.send(JSON.stringify(metadata))

      // Start timing for estimated time calculation
      startTimeRef.current = Date.now()

      // Read and send the file in chunks
      const reader = new FileReader()
      let offset = 0

      const readSlice = (o: number) => {
        const slice = file.slice(o, o + CHUNK_SIZE)
        reader.readAsArrayBuffer(slice)
      }

      reader.onload = (e) => {
        if (!e.target?.result || !dataChannelRef.current) return

        dataChannelRef.current.send(e.target.result as ArrayBuffer)
        offset += (e.target.result as ArrayBuffer).byteLength

        // Update progress
        const newProgress = (offset / file.size) * 100
        setProgress(newProgress)

        // Calculate estimated time remaining
        if (startTimeRef.current > 0) {
          const elapsedTime = (Date.now() - startTimeRef.current) / 1000 // in seconds
          const bytesPerSecond = offset / elapsedTime
          const remainingBytes = file.size - offset
          const remainingTime = bytesPerSecond > 0 ? Math.ceil(remainingBytes / bytesPerSecond) : 0

          setEstimatedTime(remainingTime)
        }

        // Continue with the next slice or finish
        if (offset < file.size) {
          readSlice(offset)
        } else {
          // Send completion message
          dataChannelRef.current.send(JSON.stringify({ type: "file-complete" }))

          setStatus("File sent successfully!")
          toast({
            title: "Transfer Complete",
            description: "File has been sent successfully",
          })
        }
      }

      reader.onerror = (error) => {
        console.error("Error reading file:", error)
        toast({
          title: "File Error",
          description: "Error reading the file",
          variant: "destructive",
        })
      }

      // Start reading the first slice
      readSlice(0)
    } catch (error) {
      console.error("Error sending file:", error)
      toast({
        title: "Transfer Error",
        description: "Failed to send the file",
        variant: "destructive",
      })
    }
  }

  // Save the received file
  const saveReceivedFile = () => {
    try {
      // Combine all chunks into a single blob
      const blob = new Blob(fileChunksRef.current, { type: fileTypeRef.current })

      // Create a download link
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileNameRef.current
      document.body.appendChild(a)
      a.click()

      // Clean up
      setTimeout(() => {
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }, 100)

      setStatus("File received successfully!")
      toast({
        title: "Transfer Complete",
        description: "File has been received successfully",
      })
    } catch (error) {
      console.error("Error saving file:", error)
      toast({
        title: "File Error",
        description: "Error saving the received file",
        variant: "destructive",
      })
    }
  }

  // Reset the connection
  const resetConnection = () => {
    // Close existing connections
    if (dataChannelRef.current) {
      dataChannelRef.current.close()
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
    }

    // Reset state
    setSelectedFile(null)
    setShareCode("")
    setProgress(0)
    setEstimatedTime(0)
    setStatus("")
    setIsConnected(false)

    // Reset refs
    dataChannelRef.current = null
    peerConnectionRef.current = null
    fileChunksRef.current = []
    receivedSizeRef.current = 0
    totalSizeRef.current = 0
    fileNameRef.current = ""
    fileTypeRef.current = ""
    startTimeRef.current = 0
  }

  return {
    selectedFile,
    shareCode,
    progress,
    estimatedTime,
    status,
    isConnected,
    handleFileSelect,
    generateCode,
    connectWithCode,
    resetConnection,
  }
}

