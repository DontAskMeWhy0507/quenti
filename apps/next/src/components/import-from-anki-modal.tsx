import React, { useState, useRef } from "react";
import { useRouter } from "next/router";
import { signIn } from "next-auth/react";
import { Modal } from "@quenti/components/modal";
import { api } from "@quenti/trpc";
import {
  Button,
  ButtonGroup,
  FormControl,
  FormLabel,
  Stack,
  Text,
  Progress,
  Box,
  HStack,
  Icon,
  Divider,
  useColorModeValue,
} from "@chakra-ui/react";
import {
  IconUpload,
  IconFileZip,
  IconCheck,
  IconAlertCircle,
  IconBrandGoogleDrive,
} from "@tabler/icons-react";
import { effectChannel } from "../events/effects";

export interface ImportFromAnkiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DriveFileItem {
  id: string;
  name: string;
  sizeBytes: number;
  modifiedTime: string;
}

export const ImportFromAnkiModal: React.FC<ImportFromAnkiModalProps> = ({
  isOpen,
  onClose,
}) => {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[] | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveNeedsConsent, setDriveNeedsConsent] = useState(false);

  const dropzoneBg = useColorModeValue("gray.50", "gray.900");
  const borderColor = useColorModeValue("gray.300", "gray.700");
  const secondaryText = useColorModeValue("gray.600", "gray.400");
  const driveRowHoverBg = useColorModeValue("gray.100", "gray.800");

  const onImportSuccess = async (data: { createdSetId?: string }) => {
    setLoading(false);
    setProgressMsg("Import complete!");
    effectChannel.emit("prepareConfetti");
    effectChannel.emit("confetti");

    onClose();
    if (data.createdSetId) {
      await router.push(`/${data.createdSetId}`);
    }
  };
  const onImportError = (err: { message?: string }) => {
    setLoading(false);
    setError(err.message || "Failed to import Anki package");
  };

  const importMutation = api.anki.importPackage.useMutation({
    onSuccess: onImportSuccess,
    onError: onImportError,
  });

  const driveImportMutation = api.anki.importFromDrive.useMutation({
    onSuccess: onImportSuccess,
    onError: onImportError,
  });

  const driveListQuery = api.anki.listDriveDecks.useQuery(
    {},
    { enabled: false, retry: false },
  );

  const handleLoadDriveFiles = async () => {
    setError("");
    setDriveNeedsConsent(false);
    setDriveLoading(true);
    const res = await driveListQuery.refetch();
    setDriveLoading(false);
    if (res.error) {
      const msg = res.error.message || "";
      if (msg.includes("DRIVE_NEEDS_CONSENT") || msg.includes("DRIVE_NO_ACCOUNT")) {
        setDriveNeedsConsent(true);
      } else {
        setError(msg || "Could not load your Google Drive files.");
      }
      return;
    }
    setDriveFiles(res.data?.files ?? []);
  };

  const handleDriveImport = (file: DriveFileItem) => {
    const sizeMb = file.sizeBytes / (1024 * 1024);
    if (sizeMb > 150) {
      setError(
        `This file is ${sizeMb.toFixed(1)}MB. In-app import works best under 150MB; very large decks may fail here.`,
      );
      return;
    }
    setError("");
    setLoading(true);
    setProgressMsg(`Downloading "${file.name}" from Google Drive...`);
    driveImportMutation.mutate({ fileId: file.id, fileName: file.name });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".apkg")) {
        setError("Please select a valid Anki package (.apkg) file.");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    // Check size warning
    const sizeMb = selectedFile.size / (1024 * 1024);
    if (sizeMb > 150) {
      setError(
        `This file is ${sizeMb.toFixed(1)}MB. For packages over 150MB, please use the CLI importer "npm run anki:import '${selectedFile.name}'" for best performance.`
      );
      return;
    }

    setLoading(true);
    setProgressMsg("Reading Anki package...");

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1] ?? "";
        setProgressMsg("Parsing decks, cards, and media...");
        importMutation.mutate({
          fileBase64: base64,
          fileName: selectedFile.name,
        });
      };
      reader.onerror = () => {
        setLoading(false);
        setError("Error reading local file.");
      };
      reader.readAsDataURL(selectedFile);
    } catch (err: any) {
      setLoading(false);
      setError(err.message || "Error processing file.");
    }
  };

  const resetState = () => {
    setSelectedFile(null);
    setError("");
    setLoading(false);
    setProgressMsg("");
    setDriveFiles(null);
    setDriveNeedsConsent(false);
  };

  return (
    <Modal
      onClose={() => {
        if (!loading) {
          resetState();
          onClose();
        }
      }}
      isOpen={isOpen}
      size="xl"
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Body>
          <Modal.Heading>Import from Anki</Modal.Heading>
          <Stack spacing={4} mt={2}>
            <Text color={secondaryText} fontSize="sm">
              Upload an Anki deck package (<code>.apkg</code>). Sub-decks, card templates,
              embedded audio, images, and cloze deletions will be automatically preserved.
            </Text>

            <Box
              border="2px dashed"
              borderColor={borderColor}
              rounded="xl"
              p={6}
              bg={dropzoneBg}
              textAlign="center"
              cursor={loading ? "not-allowed" : "pointer"}
              onClick={() => !loading && fileInputRef.current?.click()}
              _hover={{ borderColor: "orange.400" }}
              transition="all 0.2s"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".apkg"
                style={{ display: "none" }}
                onChange={handleFileChange}
                disabled={loading}
              />
              <Stack align="center" spacing={2}>
                <Icon
                  as={selectedFile ? IconFileZip : IconUpload}
                  boxSize={10}
                  color={selectedFile ? "orange.400" : "gray.400"}
                />
                {selectedFile ? (
                  <>
                    <Text fontWeight={700}>{selectedFile.name}</Text>
                    <Text fontSize="xs" color={secondaryText}>
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </Text>
                  </>
                ) : (
                  <>
                    <Text fontWeight={600}>Click or drag to select an .apkg file</Text>
                    <Text fontSize="xs" color={secondaryText}>
                      Supports modern Anki 2.1 (Zstd) and legacy packages
                    </Text>
                  </>
                )}
              </Stack>
            </Box>

            {!selectedFile && (
              <>
                <HStack>
                  <Divider />
                  <Text fontSize="xs" color={secondaryText} whiteSpace="nowrap">
                    or
                  </Text>
                  <Divider />
                </HStack>

                {driveFiles === null && !driveNeedsConsent && (
                  <Button
                    variant="outline"
                    leftIcon={<Icon as={IconBrandGoogleDrive} />}
                    onClick={handleLoadDriveFiles}
                    isLoading={driveLoading}
                    loadingText="Loading your Drive files..."
                    disabled={loading}
                  >
                    Import from Google Drive
                  </Button>
                )}

                {driveNeedsConsent && (
                  <Stack spacing={2}>
                    <Text fontSize="sm" color={secondaryText}>
                      To import from Google Drive, reconnect your Google account
                      and grant read-only Drive access.
                    </Text>
                    <Button
                      colorScheme="orange"
                      variant="outline"
                      leftIcon={<Icon as={IconBrandGoogleDrive} />}
                      onClick={() =>
                        void signIn("google", {
                          callbackUrl: window.location.pathname,
                        })
                      }
                    >
                      Reconnect Google
                    </Button>
                  </Stack>
                )}

                {driveFiles !== null && (
                  <Stack spacing={1}>
                    {driveFiles.length === 0 ? (
                      <Text fontSize="sm" color={secondaryText}>
                        No .apkg files found in your Google Drive.
                      </Text>
                    ) : (
                      driveFiles.map((f) => (
                        <Box
                          key={f.id}
                          px={3}
                          py={2}
                          rounded="lg"
                          border="1px solid"
                          borderColor={borderColor}
                          cursor={loading ? "not-allowed" : "pointer"}
                          _hover={{ bg: driveRowHoverBg }}
                          onClick={() => !loading && handleDriveImport(f)}
                        >
                          <HStack justify="space-between">
                            <Text fontSize="sm" fontWeight={600} noOfLines={1}>
                              {f.name}
                            </Text>
                            <Text
                              fontSize="xs"
                              color={secondaryText}
                              whiteSpace="nowrap"
                            >
                              {(f.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                            </Text>
                          </HStack>
                          <Text fontSize="xs" color={secondaryText}>
                            {new Date(f.modifiedTime).toLocaleDateString()}
                          </Text>
                        </Box>
                      ))
                    )}
                    <Text fontSize="xs" color={secondaryText}>
                      Decks over ~150 MB may be too large for in-app import.
                    </Text>
                  </Stack>
                )}
              </>
            )}

            {loading && (
              <Stack spacing={2} py={2}>
                <Progress size="xs" isIndeterminate colorScheme="orange" rounded="full" />
                <Text fontSize="xs" color={secondaryText} textAlign="center">
                  {progressMsg}
                </Text>
              </Stack>
            )}

            {error && (
              <HStack color="red.500" fontSize="sm" align="start">
                <Icon as={IconAlertCircle} mt={0.5} />
                <Text>{error}</Text>
              </HStack>
            )}

            <ButtonGroup justifyContent="flex-end" pt={2}>
              <Button
                variant="ghost"
                onClick={() => {
                  resetState();
                  onClose();
                }}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                colorScheme="orange"
                onClick={handleImport}
                disabled={!selectedFile || loading}
                isLoading={loading}
              >
                Import Deck
              </Button>
            </ButtonGroup>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal>
  );
};

export default ImportFromAnkiModal;
