import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import {
  Box,
  Button,
  Container,
  HStack,
  Heading,
  Stack,
  Text,
  Badge,
  Spinner,
  Icon,
  useColorModeValue,
} from "@chakra-ui/react";
import { IconArrowLeft, IconTrophy, IconRefresh } from "@tabler/icons-react";
import { api } from "@quenti/trpc";
import { AnkiCard } from "./anki-card";
import { AnkiRatingBar } from "./anki-rating-bar";

export interface AnkiStudyViewProps {
  studySetId: string;
}

export const AnkiStudyView: React.FC<AnkiStudyViewProps> = ({ studySetId }) => {
  const router = useRouter();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnswerShown, setIsAnswerShown] = useState(false);

  const [sessionCards, setSessionCards] = useState<any[]>([]);

  const utils = api.useContext();
  const queueQuery = api.anki.getReviewQueue.useQuery(
    { studySetId },
    {
      refetchOnWindowFocus: true,
      refetchInterval: (data) => (!data || data.cards.length === 0 ? 10000 : false),
    }
  );

  useEffect(() => {
    if (queueQuery.data?.cards) {
      setSessionCards(queueQuery.data.cards);
    }
  }, [queueQuery.data?.cards]);

  const submitReviewMutation = api.anki.submitReview.useMutation({
    onSuccess: () => {
      // Invalidate review queue so other windows/devices stay synced
      void utils.anki.getReviewQueue.invalidate({ studySetId });
    },
    onError: (err) => {
      console.error("Failed to submit review:", err);
    },
  });

  const cards = sessionCards;
  const currentCard = cards[currentIndex];
  const isFinished = !queueQuery.isLoading && (cards.length === 0 || currentIndex >= cards.length);

  const handleShowAnswer = useCallback(() => {
    setIsAnswerShown(true);
  }, []);

  const handleRate = useCallback(
    (rating: 1 | 2 | 3 | 4) => {
      if (!currentCard || submitReviewMutation.isLoading) return;
      const ratedCard = currentCard;
      submitReviewMutation.mutate({
        studySetId,
        termId: ratedCard.termId,
        rating,
      });

      setIsAnswerShown(false);
      if (rating === 1) {
        // Re-queue card to end of session queue so it repeats before session ends
        setSessionCards((prev) => [...prev, ratedCard]);
      }
      setCurrentIndex((prev) => prev + 1);
    },
    [currentCard, studySetId, submitReviewMutation]
  );

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not trigger if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === "Space" || e.key === "Enter") {
        e.preventDefault();
        if (!isAnswerShown) {
          handleShowAnswer();
        } else if (!submitReviewMutation.isLoading) {
          handleRate(3); // Default to Good rating, matching Anki ergonomics
        }
      } else if (isAnswerShown && !submitReviewMutation.isLoading) {
        if (e.key === "1") handleRate(1);
        else if (e.key === "2") handleRate(2);
        else if (e.key === "3") handleRate(3);
        else if (e.key === "4") handleRate(4);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAnswerShown, handleShowAnswer, handleRate, submitReviewMutation.isLoading]);

  const secondaryText = useColorModeValue("gray.600", "gray.400");
  const counts = queueQuery.data?.counts || { new: 0, learn: 0, review: 0 };

  if (queueQuery.isLoading) {
    return (
      <Container maxW="3xl" py={20} textAlign="center">
        <Spinner size="xl" color="orange.400" />
        <Text mt={4} color={secondaryText}>
          Loading Anki review queue...
        </Text>
      </Container>
    );
  }

  if (queueQuery.isError) {
    return (
      <Container maxW="2xl" py={20} textAlign="center">
        <Stack spacing={4} align="center">
          <Heading size="md" color="red.400">
            Error Loading Review Queue
          </Heading>
          <Text color={secondaryText}>
            {queueQuery.error.message || "Failed to load study cards."}
          </Text>
          <Button
            leftIcon={<IconRefresh size={18} />}
            colorScheme="orange"
            onClick={() => void queueQuery.refetch()}
          >
            Retry
          </Button>
        </Stack>
      </Container>
    );
  }

  if (isFinished) {
    return (
      <Container maxW="2xl" py={20} textAlign="center">
        <Stack spacing={6} align="center">
          <Icon as={IconTrophy} boxSize={16} color="orange.400" />
          <Heading size="lg">Congratulations!</Heading>
          <Text color={secondaryText} fontSize="md">
            You have finished all due cards in this deck for now.
          </Text>
          <HStack spacing={4}>
            <Button
              leftIcon={<IconRefresh size={18} />}
              onClick={() => {
                setCurrentIndex(0);
                setIsAnswerShown(false);
                void utils.anki.getReviewQueue.invalidate({ studySetId });
              }}
            >
              Check Again
            </Button>
            <Button
              colorScheme="orange"
              onClick={() => router.push(`/${studySetId}`)}
            >
              Back to Deck
            </Button>
          </HStack>
        </Stack>
      </Container>
    );
  }

  return (
    <Container maxW="4xl" py={6}>
      <Stack spacing={6}>
        {/* Header Bar */}
        <HStack justify="space-between" align="center">
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<IconArrowLeft size={16} />}
            onClick={() => router.push(`/${studySetId}`)}
          >
            Back to Deck
          </Button>

          {/* Anki Review Counters: Blue (New), Red (Learn), Green (Review) */}
          <HStack spacing={3}>
            <Badge colorScheme="blue" px={2.5} py={1} rounded="md" fontSize="sm">
              New: {counts.new}
            </Badge>
            <Badge colorScheme="red" px={2.5} py={1} rounded="md" fontSize="sm">
              Learn: {counts.learn}
            </Badge>
            <Badge colorScheme="green" px={2.5} py={1} rounded="md" fontSize="sm">
              Review: {counts.review}
            </Badge>
          </HStack>
        </HStack>

        {/* Card View */}
        {currentCard && (
          <AnkiCard
            frontHtml={currentCard.word}
            backHtml={currentCard.definition}
            isAnswerShown={isAnswerShown}
            onFlip={handleShowAnswer}
          />
        )}

        {/* Action Controls */}
        <Box pt={2}>
          {!isAnswerShown ? (
            <Button
              w="full"
              h="54px"
              colorScheme="orange"
              fontSize="md"
              fontWeight={700}
              onClick={handleShowAnswer}
            >
              Show Answer (Space)
            </Button>
          ) : (
            currentCard && (
              <AnkiRatingBar
                estimates={currentCard.estimates}
                onRate={handleRate}
                isLoading={submitReviewMutation.isLoading}
              />
            )
          )}
        </Box>
      </Stack>
    </Container>
  );
};

export default AnkiStudyView;
