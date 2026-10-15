import React from "react";

import type { StudySet } from "@quenti/prisma/client";

import { HStack, Text, Badge } from "@chakra-ui/react";

import { IconPointFilled, IconProgress } from "@tabler/icons-react";

import { visibilityIcon } from "../common/visibility-icon";
import { plural } from "../utils/string";
import { GenericCard } from "./generic-card";
import { GenericCollaboratorsFooter } from "./generic-collaborators-footer";

export interface StudySetCardProps {
  studySet: Pick<StudySet, "id" | "title" | "visibility" | "type"> & {
    tags?: any;
    description?: string | null;
  };
  numTerms: number;
  collaborators?: { total: number; avatars: string[] };
  draft?: boolean;
  user: {
    username: string | null;
    image: string | null;
  };
  verified?: boolean;
  removable?: boolean;
  onRemove?: () => void;
}

export const StudySetCard: React.FC<StudySetCardProps> = ({
  studySet,
  numTerms,
  collaborators,
  draft,
  user,
  verified = false,
  removable = false,
  onRemove,
}) => {
  const isAnki =
    (Array.isArray(studySet.tags) && studySet.tags.includes("anki")) ||
    (typeof studySet.tags === "string" && studySet.tags.includes("anki")) ||
    (studySet.description?.toLowerCase().includes("anki") ?? false);

  const cardUrl = draft
    ? `/${studySet.id}/create`
    : isAnki
    ? `/sets/${studySet.id}/anki`
    : `/${studySet.id}`;

  return (
    <GenericCard
      title={studySet.title || "Untitled"}
      numItems={numTerms}
      url={cardUrl}
      itemsLabel={isAnki ? "cards" : "term"}
      label={
        draft ? (
          <>
            <IconProgress size={16} />
            <HStack spacing="1" fontSize="sm">
              <Text>Draft</Text>
              <IconPointFilled size={8} />
              <Text>{plural(numTerms, "term")}</Text>
            </HStack>
          </>
        ) : isAnki ? (
          <Badge colorScheme="purple" fontSize="xs" px={1.5} py={0.5} rounded="md">
            Anki SRS
          </Badge>
        ) : undefined
      }
      reverseTitle={draft}
      rightIcon={
        studySet.visibility !== "Public"
          ? visibilityIcon(studySet.visibility, 16)
          : undefined
      }
      user={user}
      bottom={
        studySet.type == "Collab" ? (
          <GenericCollaboratorsFooter
            avatars={collaborators?.avatars || []}
            total={collaborators?.total || 0}
          />
        ) : undefined
      }
      verified={verified}
      removable={removable}
      onRemove={onRemove}
    />
  );
};
