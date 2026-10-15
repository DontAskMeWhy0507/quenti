import { useSession } from "next-auth/react";
import React from "react";

import { api } from "@quenti/trpc";

import {
  Badge,
  Grid,
  GridItem,
  Heading,
  HStack,
  Skeleton,
  Stack,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { IconBrain, IconCards } from "@tabler/icons-react";

import { FolderCard } from "../../components/folder-card";
import { GenericCard } from "../../components/generic-card";
import { StudySetCard } from "../../components/study-set-card";

export const SetGrid = () => {
  const { status } = useSession();
  const { data, isLoading: recentLoading } = api.recent.get.useQuery();
  const isLoading = status == "unauthenticated" || recentLoading;
  const secondaryColor = useColorModeValue("gray.600", "gray.400");

  if (data && !data.entities.length) return null;

  const isAnkiEntity = (item: any) =>
    (Array.isArray(item.tags) && item.tags.includes("anki")) ||
    (typeof item.tags === "string" && item.tags.includes("anki")) ||
    (item.description?.toLowerCase().includes("anki") ?? false);

  const ankiDecks = (data?.entities || []).filter(
    (item) => item.entityType === "set" && isAnkiEntity(item)
  );

  const quizEntities = (data?.entities || []).filter(
    (item) => item.entityType !== "set" || !isAnkiEntity(item)
  );

  return (
    <Stack spacing={10}>
      {/* Dedicated Anki Decks Section */}
      {ankiDecks.length > 0 && (
        <Stack spacing={4}>
          <HStack justify="space-between" align="center">
            <HStack spacing={2.5}>
              <IconBrain size={24} color="#805ad5" />
              <Heading size="lg">Anki Decks (SRS)</Heading>
              <Badge colorScheme="purple" fontSize="sm" px={2} py={0.5} rounded="md">
                Spaced Repetition
              </Badge>
            </HStack>
            <Text fontSize="sm" color={secondaryColor}>
              {ankiDecks.length} {ankiDecks.length === 1 ? "deck" : "decks"}
            </Text>
          </HStack>
          <Text fontSize="sm" color={secondaryColor} mt={-2}>
            Dedicated Anki study mode with SM-2 spaced repetition algorithm, audio, and images.
          </Text>
          <Grid templateColumns="repeat(auto-fill, minmax(256px, 1fr))" gap={4}>
            {ankiDecks.map((item) => (
              <GridItem key={item.id} h="156px">
                <StudySetCard
                  studySet={{
                    ...item,
                    visibility: item.visibility!,
                    type: item.type!,
                  }}
                  collaborators={item.collaborators}
                  draft={item.draft}
                  numTerms={item.numItems}
                  user={item.user}
                />
              </GridItem>
            ))}
          </Grid>
        </Stack>
      )}

      {/* Standard Quiz Sets & Folders Section */}
      {(quizEntities.length > 0 || (isLoading && ankiDecks.length === 0)) && (
        <Stack spacing={4}>
          <Skeleton isLoaded={!!data} rounded="md" fitContent>
            <HStack spacing={2}>
              <IconCards size={24} />
              <Heading size="lg">Quiz Sets &amp; Folders</Heading>
            </HStack>
          </Skeleton>
          <Grid templateColumns="repeat(auto-fill, minmax(256px, 1fr))" gap={4}>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <GridItem h="156px" key={i}>
                  <GenericCard.Skeleton />
                </GridItem>
              ))}
            {quizEntities.map((item) => (
              <GridItem key={item.id} h="156px">
                {item.entityType == "set" ? (
                  <StudySetCard
                    studySet={{
                      ...item,
                      visibility: item.visibility!,
                      type: item.type!,
                    }}
                    collaborators={item.collaborators}
                    draft={item.draft}
                    numTerms={item.numItems}
                    user={item.user}
                  />
                ) : (
                  <FolderCard
                    folder={{ ...item }}
                    numSets={item.numItems}
                    user={item.user}
                  />
                )}
              </GridItem>
            ))}
          </Grid>
        </Stack>
      )}
    </Stack>
  );
};
