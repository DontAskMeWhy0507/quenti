import React from "react";
import { useRouter } from "next/router";
import { HeadSeo } from "@quenti/components/head-seo";
import { Container, Spinner } from "@chakra-ui/react";
import { PageWrapper } from "../../../common/page-wrapper";
import { AuthedPage } from "../../../components/authed-page";
import { getLayout } from "../../../layouts/main-layout";
import { AnkiStudyView } from "../../../modules/anki/anki-study-view";

const AnkiPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const studySetId = typeof id === "string" ? id : "";

  return (
    <AuthedPage>
      <HeadSeo title="Anki Spaced Repetition" />
      {studySetId ? (
        <AnkiStudyView studySetId={studySetId} />
      ) : (
        <Container py={20} textAlign="center">
          <Spinner size="xl" color="orange.400" />
        </Container>
      )}
    </AuthedPage>
  );
};

AnkiPage.PageWrapper = PageWrapper;
AnkiPage.getLayout = getLayout;

export default AnkiPage;
