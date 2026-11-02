import type { GetServerSideProps } from "next";

import { HeadSeo } from "@quenti/components/head-seo";

import {
  Container,
  Heading,
  ListItem,
  Stack,
  Text,
  UnorderedList,
} from "@chakra-ui/react";

import { WithFooter } from "../components/with-footer";
import { getLayout } from "../layouts/main-layout";

const Features = () => {
  return (
    <>
      <HeadSeo title="Features" />
      <WithFooter>
        <Container maxW="3xl" py={10}>
          <Stack spacing={6}>
            <Heading as="h1" size="xl">
              Features
            </Heading>
            <Text>
              Quenti is an open-source study platform. This personal instance
              includes:
            </Text>
            <UnorderedList spacing={2} pl={4}>
              <ListItem>
                Study sets with text, image, and audio terms, organized in
                folders
              </ListItem>
              <ListItem>
                Multiple ways to study, including flashcards and practice
                modes
              </ListItem>
              <ListItem>
                Anki mode: import .apkg decks and review them with
                spaced-repetition scheduling
              </ListItem>
              <ListItem>Import from Quizlet, including profile imports</ListItem>
              <ListItem>
                Classes with assignments, sections, and member management
              </ListItem>
              <ListItem>Organizations for schools and larger groups</ListItem>
              <ListItem>Collaborative editing of shared study sets</ListItem>
              <ListItem>Diagrams and labeled-image study sets</ListItem>
            </UnorderedList>
            <Text>
              Sign in with Google to create your first set — it is free, and
              there are no paid tiers on this site.
            </Text>
          </Stack>
        </Container>
      </WithFooter>
    </>
  );
};

Features.getLayout = getLayout;

export default Features;

export const getServerSideProps: GetServerSideProps = async () => ({
  props: {},
});
