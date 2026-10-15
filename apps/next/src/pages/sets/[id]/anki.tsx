import React from "react";
import { useRouter } from "next/router";
import { HeadSeo } from "@quenti/components/head-seo";
import { Container, Spinner } from "@chakra-ui/react";
import { PageWrapper } from "../../../common/page-wrapper";
import { getLayout } from "../../../layouts/main-layout";
import { AnkiStudyView } from "../../../modules/anki/anki-study-view";
import { HydrateSetData } from "../../../modules/hydrate-set-data";

const AnkiPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const studySetId = typeof id === "string" ? id : "";

  return (
    <>
      <HeadSeo title="Anki Spaced Repetition" />
      <HydrateSetData
        isPublic
        placeholder={
          <Container py={20} textAlign="center">
            <Spinner size="xl" color="orange.400" />
          </Container>
        }
      >
        {studySetId ? <AnkiStudyView studySetId={studySetId} /> : null}
      </HydrateSetData>
    </>
  );
};

AnkiPage.PageWrapper = PageWrapper;
AnkiPage.getLayout = getLayout;

export default AnkiPage;
