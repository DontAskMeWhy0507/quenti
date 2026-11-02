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

import { PageWrapper } from "../common/page-wrapper";
import { WithFooter } from "../components/with-footer";
import { getLayout } from "../layouts/main-layout";

const Pricing = () => {
  return (
    <>
      <HeadSeo title="Pricing" />
      <WithFooter>
        <Container maxW="3xl" py={10}>
          <Stack spacing={6}>
            <Heading as="h1" size="xl">
              Pricing
            </Heading>
            <Text>
              This website is a personal, self-hosted deployment of Quenti,
              the open-source study platform. It is completely free to use:
              there are no subscriptions and no paid plans are sold on this
              site.
            </Text>
            <UnorderedList spacing={2} pl={4}>
              <ListItem>Study sets and all study modes — free</ListItem>
              <ListItem>Classes and organizations — free</ListItem>
              <ListItem>Quizlet and Anki import — free</ListItem>
              <ListItem>Spaced-repetition review — free</ListItem>
            </UnorderedList>
            <Text>
              If paid plans are ever introduced, they will be described on
              this page before anything changes for existing users.
            </Text>
          </Stack>
        </Container>
      </WithFooter>
    </>
  );
};

Pricing.PageWrapper = PageWrapper;
Pricing.getLayout = getLayout;

export default Pricing;

export const getServerSideProps: GetServerSideProps = async () => ({
  props: {},
});
