import React, { useMemo, useEffect } from "react";
import { Box, Card, CardBody, Divider, Stack, useColorModeValue } from "@chakra-ui/react";
import { AnkiAudioPlayer, stopAllAnkiAudio } from "./anki-audio-player";

export interface AnkiCardProps {
  frontHtml: string;
  backHtml: string;
  isAnswerShown: boolean;
  onFlip?: () => void;
}

export const AnkiCard: React.FC<AnkiCardProps> = ({
  frontHtml,
  backHtml,
  isAnswerShown,
  onFlip,
}) => {
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const clozeBg = useColorModeValue("orange.100", "orange.900");
  const clozeColor = useColorModeValue("orange.800", "orange.200");

  // Stop any playing audio whenever card side flips or new card is loaded
  useEffect(() => {
    stopAllAnkiAudio();
  }, [frontHtml, isAnswerShown]);

  // Extract audio files referenced in front HTML
  const frontAudioSources = useMemo(() => {
    const matches: string[] = [];
    const regex = /data-src=["']([^"']+\.(?:mp3|wav|ogg|m4a))["']/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(frontHtml)) !== null) {
      if (match[1] && !matches.includes(match[1])) matches.push(match[1]);
    }
    return matches;
  }, [frontHtml]);

  // Extract audio files referenced in back HTML
  const backAudioSources = useMemo(() => {
    const matches: string[] = [];
    const regex = /data-src=["']([^"']+\.(?:mp3|wav|ogg|m4a))["']/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(backHtml)) !== null) {
      if (match[1] && !matches.includes(match[1])) matches.push(match[1]);
    }
    return matches;
  }, [backHtml]);

  // Distinct back audio files (avoid re-playing front pronunciation on answer side)
  const newBackAudioSources = useMemo(() => {
    const frontSet = new Set(frontAudioSources);
    return backAudioSources.filter((src) => !frontSet.has(src));
  }, [frontAudioSources, backAudioSources]);

  return (
    <Card
      bg={cardBg}
      borderWidth="1px"
      borderColor={borderColor}
      rounded="2xl"
      shadow="md"
      w="full"
      minH={{ base: "340px", md: "420px" }}
      display="flex"
      flexDirection="column"
      justifyContent="center"
      position="relative"
      p={{ base: 4, md: 8 }}
      onClick={!isAnswerShown ? onFlip : undefined}
      cursor={!isAnswerShown && onFlip ? "pointer" : "default"}
      userSelect={!isAnswerShown ? "none" : "text"}
      sx={{
        ".anki-cloze": {
          bg: clozeBg,
          color: clozeColor,
          fontWeight: "bold",
          px: 1.5,
          py: 0.5,
          rounded: "md",
        },
        ".anki-img": {
          maxW: "100%",
          maxH: "260px",
          objectFit: "contain",
          mx: "auto",
          my: 2,
          rounded: "lg",
        },
        "img": {
          maxW: "100%",
          maxH: "260px",
          objectFit: "contain",
          mx: "auto",
          my: 2,
          rounded: "lg",
        },
      }}
    >
      <CardBody display="flex" flexDirection="column" alignItems="center" justifyContent="center">
        {/* Question Side */}
        <Box textAlign="center" fontSize={{ base: "xl", md: "2xl" }} lineHeight="1.6" w="full">
          <div dangerouslySetInnerHTML={{ __html: frontHtml }} />
          {frontAudioSources.map((src, i) => (
            <AnkiAudioPlayer
              key={`front-audio-${src}-${i}`}
              src={src}
              autoPlay={i === 0}
            />
          ))}
        </Box>

        {/* Answer Side */}
        {isAnswerShown && (
          <Stack spacing={4} w="full" mt={6} align="center">
            <Divider borderColor={borderColor} />
            <Box textAlign="center" fontSize={{ base: "lg", md: "xl" }} lineHeight="1.6" w="full">
              <div dangerouslySetInnerHTML={{ __html: backHtml }} />
              {/* Only render players for new back audio or allow playing them without duplicate autoplay */}
              {newBackAudioSources.map((src, i) => (
                <AnkiAudioPlayer
                  key={`back-audio-${src}-${i}`}
                  src={src}
                  autoPlay={i === 0}
                />
              ))}
            </Box>
          </Stack>
        )}
      </CardBody>
    </Card>
  );
};

export default AnkiCard;
