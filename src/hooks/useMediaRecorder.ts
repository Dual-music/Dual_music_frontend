/**
 * useMediaRecorder
 * ----------------
 * Wrapper React de l'API MediaRecorder pour enregistrer la sortie composite
 * (Canvas + AudioContext mixé) d'un concert/duel en VOD.
 *
 * Upload progressif vers Supabase Storage (`replay-videos` bucket) puis
 * insertion de `replay_videos` à la fin. Codec préféré : video/webm;codecs=vp9.
 *
 * @see mem://architecture/composite-recording-engine
 */
import { useState, useRef, useCallback } from "react";
import { uploadFile } from "@/api/endpoints/uploads";

interface UseMediaRecorderOptions {
  stream: MediaStream | null;
  concertId: string;
  userId: string;
  onRecordingComplete?: (url: string) => void;
}

export const useMediaRecorder = ({ stream, concertId, userId, onRecordingComplete }: UseMediaRecorderOptions) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedBlobs, setRecordedBlobs] = useState<Blob[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getSupportedMimeType = (): string => {
    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "video/webm";
  };

  const startDurationTimer = useCallback(() => {
    durationIntervalRef.current = setInterval(() => {
      setRecordingDuration(prev => prev + 1);
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!stream) {
      console.error("No stream available for recording");
      return false;
    }

    try {
      const mimeType = getSupportedMimeType();
      console.log("Using MIME type for recording:", mimeType);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000, // 2.5 Mbps
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        setRecordedBlobs([...chunksRef.current]);
        console.log("Recording stopped, chunks collected:", chunksRef.current.length);
        stopDurationTimer();
      };

      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setIsPaused(false);
      setRecordedBlobs([]);
      setRecordingDuration(0);
      startDurationTimer();

      console.log("Recording started");
      return true;
    } catch (error) {
      console.error("Error starting recording:", error);
      return false;
    }
  }, [stream, startDurationTimer, stopDurationTimer]);

  const pauseRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording || isPaused) {
      return false;
    }

    try {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      stopDurationTimer();
      console.log("Recording paused");
      return true;
    } catch (error) {
      console.error("Error pausing recording:", error);
      return false;
    }
  }, [isRecording, isPaused, stopDurationTimer]);

  const resumeRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording || !isPaused) {
      return false;
    }

    try {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      startDurationTimer();
      console.log("Recording resumed");
      return true;
    } catch (error) {
      console.error("Error resuming recording:", error);
      return false;
    }
  }, [isRecording, isPaused, startDurationTimer]);

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current || !isRecording) {
        reject(new Error("No active recording"));
        return;
      }

      const recorder = mediaRecorderRef.current;

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        console.log("Recording completed, blob size:", blob.size);
        setIsRecording(false);
        setIsPaused(false);
        stopDurationTimer();
        resolve(blob);
      };

      recorder.stop();
    });
  }, [isRecording, stopDurationTimer]);

  const uploadRecording = useCallback(async (blob: Blob): Promise<string | null> => {
    try {
      setIsUploading(true);
      setUploadProgress(0);

      const fileName = `concert-replay-${concertId}-${Date.now()}.webm`;
      // Wrap the recorded blob in a File for the presign→PUT→confirm flow.
      const file = new File([blob], fileName, { type: "video/webm" });
      const publicUrl = await uploadFile(file, "replay");

      setUploadProgress(100);
      onRecordingComplete?.(publicUrl || "");

      return publicUrl;
    } catch (error) {
      console.error("Error uploading recording:", error);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [concertId, userId, onRecordingComplete]);

  const stopAndUpload = useCallback(async (): Promise<string | null> => {
    try {
      const blob = await stopRecording();
      if (blob.size === 0) {
        console.error("Recording is empty");
        return null;
      }
      return await uploadRecording(blob);
    } catch (error) {
      console.error("Error stopping and uploading:", error);
      return null;
    }
  }, [stopRecording, uploadRecording]);

  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    isRecording,
    isPaused,
    isUploading,
    uploadProgress,
    recordedBlobs,
    recordingDuration,
    formattedDuration: formatDuration(recordingDuration),
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    uploadRecording,
    stopAndUpload,
  };
};
