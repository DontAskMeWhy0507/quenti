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

const PrivacyPolicy = () => {
  return (
    <>
      <HeadSeo title="Privacy Policy" />
      <WithFooter>
        <Container maxW="3xl" py={10}>
          <Stack spacing={6}>
            <Heading as="h1" size="xl">
              Privacy Policy
            </Heading>
            <Text color="gray.500">Effective November 2, 2026</Text>
            <Text>
              This website is a personal, self-hosted instance of Quenti, the
              open-source study platform, operated by Vu Tien Tuan Trung. This
              policy explains what information the site collects and how it is
              used.
            </Text>

            <Heading as="h2" size="md">
              What we collect
            </Heading>
            <UnorderedList spacing={2} pl={4}>
              <ListItem>
                Account information from Google sign-in: your name, email
                address, and profile picture.
              </ListItem>
              <ListItem>
                Content you create or import: study sets, terms, classes,
                folders, and Anki decks, including any images or audio
                attached to them.
              </ListItem>
              <ListItem>
                Technical data needed to run the site, such as session cookies
                and basic server logs.
              </ListItem>
            </UnorderedList>

            <Heading as="h2" size="md">
              How it is used
            </Heading>
            <Text>
              Your information is used only to operate the service: signing
              you in, storing and displaying your study content, and running
              study features such as spaced-repetition scheduling. This site
              shows no advertising, sells no data, and uses no third-party
              marketing trackers.
            </Text>

            <Heading as="h2" size="md">
              Where it is stored
            </Heading>
            <Text>
              Account and study data is stored in a cloud MySQL database
              (Aiven). Uploaded files are stored in Cloudflare R2 object
              storage. Sign-in is handled by Google, and transactional email,
              when used, is sent through Resend.
            </Text>

            <Heading as="h2" size="md">
              Cookies
            </Heading>
            <Text>
              The site uses session cookies that are required for sign-in to
              work. It does not use advertising or cross-site tracking
              cookies.
            </Text>

            <Heading as="h2" size="md">
              Your choices
            </Heading>
            <Text>
              You can edit or delete your study content at any time. You can
              delete your account from Settings, which removes your account
              and the content associated with it. For any other request about
              your data, contact the operator at the address below.
            </Text>

            <Heading as="h2" size="md">
              Changes and contact
            </Heading>
            <Text>
              If this policy changes, the updated version will be posted on
              this page. Questions can be sent to tuantrung0705@gmail.com.
            </Text>
          </Stack>
        </Container>
      </WithFooter>
    </>
  );
};

PrivacyPolicy.PageWrapper = PageWrapper;
PrivacyPolicy.getLayout = getLayout;

export default PrivacyPolicy;

export const getServerSideProps: GetServerSideProps = async () => ({
  props: {},
});
