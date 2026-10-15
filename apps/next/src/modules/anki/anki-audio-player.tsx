import React, { useEffect, useRef } from "react";
import { IconButton, HStack, Tooltip } from "@chakra-ui/react";
import { IconVolume } from "@tabler/icons-react";

export interface AnkiAudioPlayerProps {
  src: string;
  autoPlay?: boolean;
}

export const AnkiAudioPlayer: React.FC<AnkiAudioPlayerProps> = ({
  src,
  autoPlay = true,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Auto-play was blocked or source loading
      });
    }
  };

  useEffect(() => {
    if (autoPlay) {
      const timeout = setTimeout(playAudio, 100);
      return () => clearTimeout(timeout);
    }
  }, [src, autoPlay]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "r" || e.key === "R") {
        playAudio();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <HStack display="inline-flex" my={1}>
      <audio ref={audioRef} src={src} preload="auto" />
      <Tooltip label="Replay audio (R)" placement="top" hasArrow>
        <IconButton
          aria-label="Replay audio"
          icon={<IconVolume size={20} />}
          size="sm"
          variant="ghost"
          colorScheme="orange"
          onClick={playAudio}
        />
      </Tooltip>
    </HStack>
  );
};

export default AnkiAudioPlayer;
