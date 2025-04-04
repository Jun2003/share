"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowUpDown, FileUp, Download, Copy, Check, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useWebRTC } from "@/hooks/use-webrtc";

export default function Home() {
  const [activeTab, setActiveTab] = useState<string>("send");
  const [receiveCode, setReceiveCode] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const { toast } = useToast();
  
  const {
    selectedFile,
    shareCode,
    progress,
    estimatedTime,
    status,
    isConnected,
    socketConnected,
    handleFileSelect,
    generateCode,
    connectWithCode,
    resetConnection,
  } = useWebRTC();

  const handleCopyCode = () => {
    if (shareCode) {
      navigator.clipboard.writeText(shareCode);
      setCopied(true);
      toast({
        title: "Code copied!",
        description: "Share this code with the recipient",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Wake up the server on page load
  useEffect(() => {
    const wakeUpServer = async () => {
      try {
        const response = await fetch('https://filebeam-signaling.onrender.com/health');
        const data = await response.json();
        console.log('Server status:', data);
      } catch (error) {
        console.error('Error waking up server:', error);
      }
    };
    
    wakeUpServer();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-4xl font-bold tracking-tight">FileBeam</h1>
            {socketConnected ? (
              <Wifi className="h-5 w-5 text-green-500" />
            ) : (
              <WifiOff className="h-5 w-5 text-red-500" />
            )}
          </div>
          <p className="mt-2 text-muted-foreground">
            Transfer files directly between browsers
          </p>
          <div className="flex justify-center mt-6">
            <ArrowUpDown className="h-12 w-12 text-primary animate-pulse" />
          </div>
          
          {!socketConnected && (
            <div className="mt-4 p-2 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300 rounded-md text-sm">
              Not connected to signaling server. Please refresh the page.
            </div>
          )}
        </div>

        <Tabs 
          defaultValue="send" 
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="send">Send File</TabsTrigger>
            <TabsTrigger value="receive">Receive File</TabsTrigger>
          </TabsList>
          
          <TabsContent value="send" className="space-y-4">
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg border-muted-foreground/25 hover:border-primary/50 transition-colors">
              {!selectedFile ? (
                <div className="space-y-4 text-center">
                  <FileUp className="mx-auto h-12 w-12 text-muted-foreground" />
                  <div>
                    <Button 
                      onClick={() => document.getElementById("file-upload")?.click()}
                      disabled={!socketConnected}
                    >
                      Select File
                    </Button>
                    <input
                      id="file-upload"
                      type="file"
                      className="hidden"
                      onChange={handleFileSelect}
                      disabled={!socketConnected}
                    />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Up to 1GB
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium truncate max-w-[200px]">
                        {selectedFile.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={resetConnection}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reset
                    </Button>
                  </div>

                  {!shareCode ? (
                    <Button 
                      className="w-full" 
                      onClick={generateCode}
                      disabled={!socketConnected}
                    >
                      Generate Sharing Code
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 bg-muted rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-sm font-medium">Sharing Code:</p>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleCopyCode}
                          >
                            {copied ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <p className="text-center font-mono text-lg select-all">
                          {shareCode}
                        </p>
                      </div>
                      
                      <div className="flex justify-center">
                        <QRCodeSVG 
                          value={shareCode} 
                          size={150} 
                          className="border-4 border-white rounded-lg"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-sm text-center font-medium">
                          {status}
                        </p>
                        {isConnected && (
                          <>
                            <Progress value={progress} className="h-2" />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{progress.toFixed(0)}%</span>
                              <span>
                                {estimatedTime > 0 
                                  ? `${estimatedTime} seconds remaining` 
                                  : "Calculating..."}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="receive" className="space-y-4">
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg border-muted-foreground/25 hover:border-primary/50 transition-colors">
              <div className="w-full space-y-4">
                <div className="space-y-2 text-center">
                  <Download className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Enter the code shared by the sender
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Input
                    placeholder="Enter sharing code"
                    value={receiveCode}
                    onChange={(e) => setReceiveCode(e.target.value)}
                    disabled={!socketConnected}
                  />
                  <Button 
                    className="w-full" 
                    onClick={() => connectWithCode(receiveCode)}
                    disabled={!receiveCode || isConnected || !socketConnected}
                  >
                    Connect
                  </Button>
                </div>
                
                {status && (
                  <div className="space-y-2">
                    <p className="text-sm text-center font-medium">
                      {status}
                    </p>
                    {isConnected && (
                      <>
                        <Progress value={progress} className="h-2" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{progress.toFixed(0)}%</span>
                          <span>
                            {estimatedTime > 0 
                              ? `${estimatedTime} seconds remaining` 
                              : "Calculating..."}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

