import React, { useState, useMemo } from "react";
import { useRouter } from "next/router";
import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Container,
  Heading,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import {
  IconArrowLeft,
  IconBrain,
  IconCards,
  IconCheck,
  IconClock,
  IconFlame,
  IconPlayerPlay,
  IconSearch,
} from "@tabler/icons-react";
import { api } from "@quenti/trpc";
import { SetData } from "../hydrate-set-data";

export interface AnkiDeckHubProps {
  data: SetData;
}

export const AnkiDeckHub: React.FC<AnkiDeckHubProps> = ({ data }) => {
  const router = useRouter();
  const secondaryColor = useColorModeValue("gray.600", "gray.400");
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  const [searchQuery, setSearchQuery] = useState("");
  const [displayCount, setDisplayCount] = useState(20);

  const queueQuery = api.anki.getReviewQueue.useQuery(
    { studySetId: data.id },
    { staleTime: 30000 }
  );

  const counts = queueQuery.data?.counts || {
    new: data.terms.length,
    learn: 0,
    review: 0,
    totalDue: data.terms.length,
  };

  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return data.terms;
    const query = searchQuery.toLowerCase();
    return data.terms.filter(
      (t) =>
        t.word.toLowerCase().includes(query) ||
        t.definition.toLowerCase().includes(query)
    );
  }, [data.terms, searchQuery]);

  const visibleCards = useMemo(() => {
    return filteredCards.slice(0, displayCount);
  }, [filteredCards, displayCount]);

  return (
    <Container maxW="5xl" py={8}>
      <Stack spacing={8}>
        {/* Back navigation */}
        <HStack justify="space-between" align="center">
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<IconArrowLeft size={16} />}
            onClick={() => router.push("/home")}
          >
            Trang chủ
          </Button>
          <Badge colorScheme="purple" fontSize="sm" px={3} py={1} rounded="full">
            <HStack spacing={1}>
              <Icon as={IconBrain} boxSize={4} />
              <Text>Anki Spaced Repetition (SRS)</Text>
            </HStack>
          </Badge>
        </HStack>

        {/* Deck Header */}
        <Card bg={cardBg} borderWidth="1px" borderColor={borderColor} rounded="2xl" p={6}>
          <CardBody>
            <Stack spacing={4}>
              <Heading size="xl">{data.title}</Heading>
              {data.description && (
                <Text color={secondaryColor} fontSize="md">
                  {data.description}
                </Text>
              )}
              <HStack spacing={4} pt={2}>
                <Button
                  size="lg"
                  colorScheme="orange"
                  leftIcon={<IconPlayerPlay size={20} />}
                  onClick={() => router.push(`/sets/${data.id}/anki`)}
                  fontSize="md"
                  px={8}
                  h="52px"
                  shadow="md"
                >
                  Học ngay (Study Now)
                </Button>
              </HStack>
            </Stack>
          </CardBody>
        </Card>

        {/* SRS Status Summary Grid */}
        <SimpleGrid columns={{ base: 1, sm: 3 }} gap={4}>
          <Card bg={cardBg} borderWidth="1px" borderColor={borderColor} rounded="xl" p={4}>
            <HStack spacing={3}>
              <Box p={2.5} rounded="lg" bg="blue.50" _dark={{ bg: "blue.900" }} color="blue.500">
                <Icon as={IconCards} boxSize={6} />
              </Box>
              <Stack spacing={0}>
                <Text fontSize="xs" fontWeight={600} color={secondaryColor} textTransform="uppercase">
                  Thẻ mới (New)
                </Text>
                <Heading size="lg" color="blue.500">
                  {queueQuery.isLoading ? <Spinner size="sm" /> : counts.new}
                </Heading>
              </Stack>
            </HStack>
          </Card>

          <Card bg={cardBg} borderWidth="1px" borderColor={borderColor} rounded="xl" p={4}>
            <HStack spacing={3}>
              <Box p={2.5} rounded="lg" bg="red.50" _dark={{ bg: "red.900" }} color="red.500">
                <Icon as={IconClock} boxSize={6} />
              </Box>
              <Stack spacing={0}>
                <Text fontSize="xs" fontWeight={600} color={secondaryColor} textTransform="uppercase">
                  Đang học (Learn)
                </Text>
                <Heading size="lg" color="red.500">
                  {queueQuery.isLoading ? <Spinner size="sm" /> : counts.learn}
                </Heading>
              </Stack>
            </HStack>
          </Card>

          <Card bg={cardBg} borderWidth="1px" borderColor={borderColor} rounded="xl" p={4}>
            <HStack spacing={3}>
              <Box p={2.5} rounded="lg" bg="green.50" _dark={{ bg: "green.900" }} color="green.500">
                <Icon as={IconCheck} boxSize={6} />
              </Box>
              <Stack spacing={0}>
                <Text fontSize="xs" fontWeight={600} color={secondaryColor} textTransform="uppercase">
                  Cần ôn (Review)
                </Text>
                <Heading size="lg" color="green.500">
                  {queueQuery.isLoading ? <Spinner size="sm" /> : counts.review}
                </Heading>
              </Stack>
            </HStack>
          </Card>
        </SimpleGrid>

        {/* Info card */}
        <Card bg={cardBg} borderWidth="1px" borderColor={borderColor} rounded="xl" p={4}>
          <HStack spacing={3}>
            <Icon as={IconFlame} boxSize={5} color="orange.400" />
            <Text fontSize="sm" color={secondaryColor}>
              Tổng số thẻ trong bộ: <b>{data.terms.length} thẻ</b>. Thuật toán SM-2 sẽ tự động phân phối thời gian ôn tập tối ưu để ghi nhớ lâu dài.
            </Text>
          </HStack>
        </Card>

        {/* Card Explorer (Progressive Chunked 20 cards at a time) */}
        <Stack spacing={4} pt={4}>
          <HStack justify="space-between" align="center" wrap="wrap" gap={3}>
            <Heading size="md">Danh sách thẻ trong bộ ({data.terms.length})</Heading>
            <InputGroup maxW="320px" size="sm">
              <InputLeftElement pointerEvents="none">
                <Icon as={IconSearch} color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Tìm kiếm thẻ..."
                rounded="lg"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setDisplayCount(20);
                }}
              />
            </InputGroup>
          </HStack>

          <Stack spacing={3}>
            {visibleCards.map((term, index) => (
              <Card
                key={term.id}
                bg={cardBg}
                borderWidth="1px"
                borderColor={borderColor}
                rounded="xl"
                p={4}
                sx={{
                  ".anki-cloze": {
                    bg: "orange.100",
                    color: "orange.800",
                    _dark: {
                      bg: "orange.900",
                      color: "orange.200",
                    },
                    fontWeight: "bold",
                    px: 1,
                    rounded: "sm",
                  },
                  ".anki-img": {
                    maxH: "140px",
                    objectFit: "contain",
                    my: 1,
                    rounded: "md",
                  },
                }}
              >
                <HStack justify="space-between" align="flex-start" spacing={4} wrap={{ base: "wrap", md: "nowrap" }}>
                  <Box flex="1" minW={{ base: "100%", md: "45%" }}>
                    <Text fontSize="xs" fontWeight="bold" color="purple.500" mb={1}>
                      Mặt trước #{index + 1}
                    </Text>
                    <Box
                      fontSize="md"
                      fontWeight={500}
                      dangerouslySetInnerHTML={{ __html: term.word }}
                    />
                  </Box>
                  <Box flex="1" minW={{ base: "100%", md: "45%" }}>
                    <Text fontSize="xs" fontWeight="bold" color="blue.500" mb={1}>
                      Mặt sau (Answer / Definition)
                    </Text>
                    <Box
                      fontSize="sm"
                      color={secondaryColor}
                      dangerouslySetInnerHTML={{ __html: term.definition }}
                    />
                  </Box>
                </HStack>
              </Card>
            ))}
          </Stack>

          {/* Progressive Load Controls */}
          {displayCount < filteredCards.length && (
            <HStack justify="space-between" pt={2} wrap="wrap" gap={3}>
              <Text fontSize="sm" color={secondaryColor}>
                Đang hiển thị {visibleCards.length} / {filteredCards.length} thẻ
              </Text>
              <HStack spacing={2}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDisplayCount((prev) =>
                      Math.min(prev + 20, filteredCards.length)
                    )
                  }
                >
                  Xem thêm ({Math.min(20, filteredCards.length - displayCount)} thẻ)
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDisplayCount(filteredCards.length)}
                >
                  Tải tất cả ({filteredCards.length})
                </Button>
              </HStack>
            </HStack>
          )}
        </Stack>
      </Stack>
    </Container>
  );
};

export default AnkiDeckHub;
