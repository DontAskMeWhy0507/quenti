import React, { useEffect, useRef } from "react";
import { IconButton, HStack, Tooltip } from "@chakra-ui/react";
import { IconVolume } from "@tabler/icons-react";

export interface AnkiAudioPlayerProps {
  src: string;
  autoPlay?: boolean;
}

// Global reference to ensure only ONE audio plays at any time (Singleton Audio Manager)
let currentPlayingAudio: HTMLAudioElement | null = null;

export const stopAllAnkiAudio = () => {
  if (currentPlayingAudio) {
    currentPlayingAudio.pause();
    currentPlayingAudio.currentTime = 0;
    currentPlayingAudio = null;
  }
};

export const AnkiAudioPlayer: React.FC<AnkiAudioPlayerProps> = ({
  src,
  autoPlay = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = () => {
    if (!audioRef.current) return;

    // Stop currently playing sound before starting new one
    if (currentPlayingAudio && currentPlayingAudio !== audioRef.current) {
      currentPlayingAudio.pause();
      currentPlayingAudio.currentTime = 0;
    }

    currentPlayingAudio = audioRef.current;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {
      // Auto-play was blocked by browser policy or loading
    });
  };

  useEffect(() => {
    if (autoPlay) {
      const timeout = setTimeout(playAudio, 150);
      return () => clearTimeout(timeout);
    }
  }, [src, autoPlay]);

  useEffect(() => {
    return () => {
      if (currentPlayingAudio && currentPlayingAudio === audioRef.current) {
        currentPlayingAudio.pause();
        currentPlayingAudio = null;
      }
    };
  }, []);

  return (
    <HStack
      display="inline-flex"
      my={1}
      onClick={(e) => {
        // Prevent clicking audio player from bubbling and flipping the card
        e.stopPropagation();
      }}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onEnded={() => {
          if (currentPlayingAudio === audioRef.current) {
            currentPlayingAudio = null;
          }
        }}
      />
      <Tooltip label="Play audio" placement="top" hasArrow>
        <IconButton
          aria-label="Play audio"
          icon={<IconVolume size={20} />}
          size="sm"
          variant="ghost"
          colorScheme="orange"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            playAudio();
          }}
        />
      </Tooltip>
    </HStack>
  );
};

export default AnkiAudioPlayer;
