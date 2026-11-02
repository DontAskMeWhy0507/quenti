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

const Terms = () => {
  return (
    <>
      <HeadSeo title="Terms of Service" />
      <WithFooter>
        <Container maxW="3xl" py={10}>
          <Stack spacing={6}>
            <Heading as="h1" size="xl">
              Terms of Service
            </Heading>
            <Text color="gray.500">Effective November 2, 2026</Text>
            <Text>
              This website is a personal, self-hosted instance of Quenti, the
              open-source study platform, operated by Vu Tien Tuan Trung. By
              using the site you agree to these terms.
            </Text>

            <Heading as="h2" size="md">
              The service
            </Heading>
            <Text>
              The site is provided free of charge, for personal study use, on
              an &quot;as is&quot; basis without warranties of any kind. It
              may change, be interrupted, or be discontinued at any time
              without notice, so keep your own copies of important study
              material.
            </Text>

            <Heading as="h2" size="md">
              Accounts
            </Heading>
            <Text>
              You sign in with a Google account and are responsible for
              activity under your account. The operator may suspend or remove
              accounts that misuse the service.
            </Text>

            <Heading as="h2" size="md">
              Your content
            </Heading>
            <Text>
              You keep ownership of the study sets, decks, and other content
              you create or import. You give the site permission to store and
              display that content to you and to the people you share it with,
              such as members of your classes.
            </Text>

            <Heading as="h2" size="md">
              Acceptable use
            </Heading>
            <UnorderedList spacing={2} pl={4}>
              <ListItem>
                Do not upload illegal content or content you have no right to
                share.
              </ListItem>
              <ListItem>
                Do not spam, abuse, or disrupt the site or other users.
              </ListItem>
              <ListItem>
                Do not attempt to bypass security measures or access other
                users&apos; private data.
              </ListItem>
            </UnorderedList>

            <Heading as="h2" size="md">
              Liability and changes
            </Heading>
            <Text>
              To the maximum extent permitted by law, the operator is not
              liable for any loss of data or other damages arising from use of
              this free personal service. These terms may be updated from time
              to time; the current version will always be posted on this page.
              Questions can be sent to tuantrung0705@gmail.com.
            </Text>
          </Stack>
        </Container>
      </WithFooter>
    </>
  );
};

Terms.PageWrapper = PageWrapper;
Terms.getLayout = getLayout;

export default Terms;

export const getServerSideProps: GetServerSideProps = async () => ({
  props: {},
});
