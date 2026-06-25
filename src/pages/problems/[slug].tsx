import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Box,
  Button,
  Flex,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Spinner,
  Text,
  Tooltip,
  VStack,
  HStack,
  Badge,
  useToast,
  Icon,
  Heading,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Link as ChakraLink,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  FormControl,
  FormLabel,
  Switch,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
} from "@chakra-ui/react";
import { useSession } from "next-auth/react";
import superjson from "superjson";
import { useHotkey } from "~/hooks/useHotKey";

import type { GetServerSideProps } from "next";
import { type Problem } from "@prisma/client";
import NextLink from "next/link";

import { Layout } from "~/components/layout";
import MySubmissions from "~/components/problem/MySubmissions";
import ProblemView from "~/components/problem/ProblemView";
import CodeEditor from "~/components/problem/CodeEditor";
import LanguageResources from "~/components/problem/LanguageResources";
import SubmissionResults from "~/components/problem/SubmissionResults";
import ResetCodeModal from "~/components/problem/ResetCodeModal";
import SplitPanel from "~/components/problem/SplitPanel";
import ResizableConsole from "~/components/problem/Console";
import VerticalSplitPanel from "~/components/problem/VerticalSplitPanel";

import { FaChevronDown, FaExclamationCircle } from "react-icons/fa";
import { FiBookOpen, FiList, FiSliders } from "react-icons/fi";
import { IoRepeat } from "react-icons/io5";

import { useCodePersistence } from "~/hooks/useCodePersistence";
import { useSubmissionStream } from "~/hooks/useSubmissionStream";
import type { ProfilingOptions } from "~/hooks/useSubmissionStream";
import { useSampleStream } from "~/hooks/useSampleStream";
import type { ExportSubmission } from "~/utils/runCsvExport";

import {
  SampleStatus,
  SubmissionStatus,
  type SampleStatusType,
} from "~/types/submission";
import {
  savePreferences,
  loadVimModePreference,
  saveVimModePreference,
} from "~/utils/localStorage";
import { validateCode } from "~/utils/starter";

import { createInnerTRPCContext } from "~/server/api/trpc";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { appRouter } from "~/server/api/root";
import { api } from "~/utils/api";
import Editor from "@monaco-editor/react";
import { FlopsModal } from "~/components/misc/FlopsModal";
import { GpuInfoModal } from "~/components/misc/GpuInfoModal";
import { LanguageInfoModal } from "~/components/misc/LanguageInfoModal";
import {
  getAllowedGpuTypes,
  GPU_DISPLAY_NAMES,
  SINGLE_GPU_TYPE,
} from "~/constants/gpu";
import {
  getLanguageGpuSupportError,
  isLanguageSupportedOnGpu,
  LANGUAGE_DISPLAY_NAMES,
} from "~/constants/language";

type ViewType = "submissions" | "problem" | "result";

type ProblemParameter = {
  name: string;
  type: string;
  const?: string | boolean;
  pointer?: string | boolean;
};

const hasFlag = (value: string | boolean | undefined) =>
  value === true || value === "true";

const getParameterDisplayType = (parameter: ProblemParameter) => {
  return parameter.type;
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const helpers = createServerSideHelpers({
    router: appRouter,
    ctx: createInnerTRPCContext({ session: null }),
    transformer: superjson,
  });

  const slug = context.params?.slug as string;

  try {
    // Prefetch the problem data
    await helpers.problems.getById.prefetch({ slug });
    // Prefetch the submissions data (this will only work if user is authenticated)
    await helpers.problems.getSubmissions.prefetch({
      problemSlug: slug,
      limit: 50,
    });

    return {
      props: {
        trpcState: helpers.dehydrate(),
        slug,
      },
    };
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error(err);
    } else {
      console.error(String(err));
    }
    return {
      notFound: true,
    };
  }
};

export default function ProblemPage({ slug }: { slug: string }) {
  const { data: session } = useSession();
  const toast = useToast();
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [viewType, setViewType] = useState<ViewType>("problem");
  const [horizontalSplitRatio, setHorizontalSplitRatio] = useState(42);
  const [leftConsoleSplitRatio, setLeftConsoleSplitRatio] = useState(100);
  const LEFT_CONSOLE_DEFAULT_RATIO = 68;
  const HORIZONTAL_DEFAULT_RATIO = 42;
  const splitContainerId = "problem-split-container";
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isParametersOpen,
    onOpen: onParametersOpen,
    onClose: onParametersClose,
  } = useDisclosure();
  const {
    isOpen: isFlopsModalOpen,
    onOpen: onFlopsModalOpen,
    onClose: onFlopsModalClose,
  } = useDisclosure();

  const {
    output: consoleOutput,
    status,
    isRunning,
    startSampleRun,
    ptxContent,
    sassContent,
  } = useSampleStream();

  // Get problem data
  const { data: problem, isLoading } = api.problems.getById.useQuery(
    { slug },
    { enabled: !!slug }
  );

  // Fetch submissions
  const submissionsQuery = api.problems.getSubmissions.useQuery(
    { problemSlug: slug },
    { enabled: !!slug }
  ) as {
    data?: { submissions: ExportSubmission[]; nextCursor: string | null };
    isLoading: boolean;
    refetch: () => void;
  };

  // Code persistence logic
  const {
    code,
    setCode,
    selectedLanguage,
    setSelectedLanguage,
    isCodeDirty,
    handleReset,
    hasLoadedPreferences,
  } = useCodePersistence(slug, problem as Problem);

  const [selectedGpuType, setSelectedGpuType] = useState(SINGLE_GPU_TYPE);
  const [isVimModeEnabled, setIsVimModeEnabled] = useState(false);
  const [hasLoadedVimPreference, setHasLoadedVimPreference] = useState(false);
  const [isAdvancedProfilingEnabled, setIsAdvancedProfilingEnabled] =
    useState(false);
  const [profileMinIterations, setProfileMinIterations] = useState(5);
  const [profileMaxIterations, setProfileMaxIterations] = useState(20);
  const [profileTargetCvPercent, setProfileTargetCvPercent] = useState(1);
  const [profileSampleIntervalMs, setProfileSampleIntervalMs] = useState(5);
  const [profileLongKernelThreshold, setProfileLongKernelThreshold] =
    useState(1);
  const [profileIncludeRawSamples, setProfileIncludeRawSamples] =
    useState(true);
  const [profileIncludeCudaKernelProfile, setProfileIncludeCudaKernelProfile] =
    useState(false);
  const [profileCudaKernelProfileTopK, setProfileCudaKernelProfileTopK] =
    useState(25);

  const profilingOptions = useMemo<ProfilingOptions | undefined>(() => {
    if (!isAdvancedProfilingEnabled) return undefined;

    const minIterations = Math.max(1, Math.round(profileMinIterations));
    const maxIterations = Math.max(
      minIterations,
      Math.round(profileMaxIterations)
    );

    return {
      min_iterations: minIterations,
      max_iterations: maxIterations,
      target_cv: Math.max(0.1, profileTargetCvPercent) / 100,
      sample_interval_ms: Math.max(1, Math.round(profileSampleIntervalMs)),
      long_kernel_threshold: Math.max(0.01, profileLongKernelThreshold),
      include_raw_samples: profileIncludeRawSamples,
      include_cuda_kernel_profile: profileIncludeCudaKernelProfile,
      cuda_kernel_profile_top_k: Math.max(
        1,
        Math.round(profileCudaKernelProfileTopK)
      ),
    };
  }, [
    isAdvancedProfilingEnabled,
    profileCudaKernelProfileTopK,
    profileIncludeCudaKernelProfile,
    profileIncludeRawSamples,
    profileLongKernelThreshold,
    profileMaxIterations,
    profileMinIterations,
    profileSampleIntervalMs,
    profileTargetCvPercent,
  ]);

  const allowedGpus = useMemo(() => {
    const gpus = (problem as { gpus?: string[] } | null)?.gpus;
    return gpus?.length ? gpus : undefined;
  }, [problem]);

  const baseGpuOptions = useMemo(
    () => getAllowedGpuTypes(allowedGpus),
    [allowedGpus]
  );

  const languageGpuError = useMemo(
    () => getLanguageGpuSupportError(selectedLanguage, selectedGpuType),
    [selectedLanguage, selectedGpuType]
  );

  // This local deployment has a single GPU. Ignore stale saved preferences and
  // problem metadata copied from the hosted multi-GPU deployment.
  useEffect(() => {
    setSelectedGpuType(SINGLE_GPU_TYPE);
  }, [baseGpuOptions]);

  useEffect(() => {
    if (!isLanguageSupportedOnGpu(selectedLanguage, selectedGpuType)) {
      setSelectedLanguage("cuda");
    }
  }, [selectedLanguage, selectedGpuType, setSelectedLanguage]);

  useEffect(() => {
    const stored = loadVimModePreference();
    if (stored !== null) {
      setIsVimModeEnabled(stored);
    }
    setHasLoadedVimPreference(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedVimPreference) return;
    saveVimModePreference(isVimModeEnabled);
  }, [isVimModeEnabled, hasLoadedVimPreference]);

  // Submission stream logic
  const {
    isSubmitting,
    metaStatus,
    metaResponse,
    testResults,
    benchmarkResults,
    isTestCaseTableOpen,
    isBenchmarking,
    setIsTestCaseTableOpen,
    processSubmission,
    startSubmission,
    totalTests,
    getTypedResponse,
    ptxContent: submissionPtxContent,
    sassContent: submissionSassContent,
    submissionId,
  } = useSubmissionStream(submissionsQuery.refetch);
  const lastSampleStatusRef = useRef<SampleStatusType>(SampleStatus.IDLE);
  const [wrongSubmissionStreak, setWrongSubmissionStreak] = useState(0);

  const [submissionPtxTimestamp, setSubmissionPtxTimestamp] =
    useState<number>(0);
  const [submissionSassTimestamp, setSubmissionSassTimestamp] =
    useState<number>(0);
  const [samplePtxTimestamp, setSamplePtxTimestamp] = useState<number>(0);
  const [sampleSassTimestamp, setSampleSassTimestamp] = useState<number>(0);
  const [ptxDirty, setPtxDirty] = useState(false);
  const [sassDirty, setSassDirty] = useState(false);
  const [isPtxSassOpen, setIsPtxSassOpen] = useState(false);
  const hasPtxOrSass = useMemo(() => {
    const effectivePtx =
      (submissionPtxTimestamp > samplePtxTimestamp
        ? (submissionPtxContent ?? ptxContent)
        : (ptxContent ?? submissionPtxContent)) ?? null;

    const effectiveSass =
      (submissionSassTimestamp > sampleSassTimestamp
        ? (submissionSassContent ?? sassContent)
        : (sassContent ?? submissionSassContent)) ?? null;

    return Boolean(effectivePtx ?? effectiveSass);
  }, [
    submissionPtxTimestamp,
    samplePtxTimestamp,
    submissionPtxContent,
    ptxContent,
    submissionSassTimestamp,
    sampleSassTimestamp,
    submissionSassContent,
    sassContent,
  ]);

  const parameters = useMemo<ProblemParameter[]>(() => {
    const raw = problem?.parameters;
    if (!Array.isArray(raw)) return [];

    return raw.reduce<ProblemParameter[]>((acc, item) => {
      if (!item || typeof item !== "object") return acc;

      const candidate = item as Record<string, unknown>;
      if (
        typeof candidate.name !== "string" ||
        typeof candidate.type !== "string"
      ) {
        return acc;
      }

      acc.push({
        name: candidate.name,
        type: candidate.type,
        const:
          typeof candidate.const === "string" ||
          typeof candidate.const === "boolean"
            ? candidate.const
            : undefined,
        pointer:
          typeof candidate.pointer === "string" ||
          typeof candidate.pointer === "boolean"
            ? candidate.pointer
            : undefined,
      });

      return acc;
    }, []);
  }, [problem?.parameters]);

  const parameterSignature = useMemo(() => {
    if (parameters.length === 0) return "solution()";

    const args = parameters
      .map(
        (parameter) => `${getParameterDisplayType(parameter)} ${parameter.name}`
      )
      .join(", ");

    return `solution(${args})`;
  }, [parameters]);

  useEffect(() => {
    if (submissionPtxContent) {
      setSubmissionPtxTimestamp(Date.now());
    }
  }, [submissionPtxContent]);

  useEffect(() => {
    if (submissionSassContent) {
      setSubmissionSassTimestamp(Date.now());
    }
  }, [submissionSassContent]);

  useEffect(() => {
    if (ptxContent) {
      setSamplePtxTimestamp(Date.now());
    }
  }, [ptxContent]);

  useEffect(() => {
    if (sassContent) {
      setSampleSassTimestamp(Date.now());
    }
  }, [sassContent]);

  const showHelpToast = useCallback(() => {
    const toastId = "need-help-toast";
    if (toast.isActive(toastId)) return;
    toast({
      id: toastId,
      title: "Need help?",
      description: (
        <>
          <ChakraLink as={NextLink} href="/blog" textDecoration="underline">
            Post a question on our blog
          </ChakraLink>{" "}
          to get tips from the community.
        </>
      ),
      duration: 5000,
      isClosable: true,
    });
  }, [toast]);

  useEffect(() => {
    if (
      status === SampleStatus.FAILED &&
      lastSampleStatusRef.current !== SampleStatus.FAILED
    ) {
      setWrongSubmissionStreak((prev) => prev + 1);
    }
    lastSampleStatusRef.current = status;
  }, [status, showHelpToast]);

  useEffect(() => {
    const status = metaResponse?.status;
    if (!status) return;

    if (status === SubmissionStatus.WRONG_ANSWER) {
      setWrongSubmissionStreak((prev) => prev + 1);
    } else {
      setWrongSubmissionStreak(0);
    }
  }, [metaResponse]);

  useEffect(() => {
    if (wrongSubmissionStreak >= 3) {
      showHelpToast();
      setWrongSubmissionStreak(0);
    }
  }, [wrongSubmissionStreak, showHelpToast]);

  const handleSetCode = useCallback(
    (newCode: string) => {
      setCode(newCode);
      if (selectedLanguage === "cuda") {
        const currentPtx =
          submissionPtxTimestamp > samplePtxTimestamp
            ? (submissionPtxContent ?? ptxContent)
            : (ptxContent ?? submissionPtxContent);
        const currentSass =
          submissionSassTimestamp > sampleSassTimestamp
            ? (submissionSassContent ?? sassContent)
            : (sassContent ?? submissionSassContent);

        if (currentPtx) {
          setPtxDirty(true);
        }
        if (currentSass) {
          setSassDirty(true);
        }
      }
    },
    [
      setCode,
      selectedLanguage,
      submissionPtxContent,
      ptxContent,
      submissionSassContent,
      sassContent,
      submissionPtxTimestamp,
      samplePtxTimestamp,
      submissionSassTimestamp,
      sampleSassTimestamp,
    ]
  );

  useEffect(() => {
    if (submissionPtxContent || ptxContent) {
      setPtxDirty(false);
    }
  }, [submissionPtxContent, ptxContent]);

  useEffect(() => {
    if (submissionSassContent || sassContent) {
      setSassDirty(false);
    }
  }, [submissionSassContent, sassContent]);

  useEffect(() => {
    if (hasLoadedPreferences && slug && selectedLanguage && selectedGpuType) {
      savePreferences(slug, {
        language: selectedLanguage,
        gpuType: selectedGpuType,
      });
    }
  }, [slug, selectedLanguage, selectedGpuType, hasLoadedPreferences]);

  // Handle submission
  const handleSubmit = useCallback(() => {
    setHorizontalSplitRatio((current) =>
      current <= 0.5 ? HORIZONTAL_DEFAULT_RATIO : current
    );

    if (!session?.user) {
      toast({
        title: "Not signed in",
        description: "Please sign in to submit solutions",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    if (languageGpuError) {
      toast({
        title: "Unsupported GPU",
        description: languageGpuError,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    const { valid, error } = validateCode(code, selectedLanguage);
    if (!valid) {
      toast({
        title: "Invalid code",
        description: error,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    startSubmission();
    setViewType("result");

    void processSubmission({
      problemSlug: slug,
      code: code,
      language: selectedLanguage,
      gpuType: selectedGpuType,
      profilingOptions,
    });
  }, [
    session?.user,
    slug,
    code,
    selectedLanguage,
    selectedGpuType,
    profilingOptions,
    processSubmission,
    startSubmission,
    setViewType,
    HORIZONTAL_DEFAULT_RATIO,
    languageGpuError,
    toast,
  ]);
  const handleRun = useCallback(async () => {
    setHorizontalSplitRatio((current) =>
      current <= 0.5 ? HORIZONTAL_DEFAULT_RATIO : current
    );

    setLeftConsoleSplitRatio((current) =>
      current >= 99.5 ? LEFT_CONSOLE_DEFAULT_RATIO : current
    );

    if (!session?.user) {
      toast({
        title: "Not signed in",
        description: "Please sign in to run solutions",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    if (languageGpuError) {
      toast({
        title: "Unsupported GPU",
        description: languageGpuError,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    const { valid, error } = validateCode(code, selectedLanguage);
    if (!valid) {
      toast({
        title: "Invalid code",
        description: error,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    await startSampleRun({
      code,
      language: selectedLanguage,
      gpuType: selectedGpuType,
      problemSlug: slug,
    });
  }, [
    startSampleRun,
    setLeftConsoleSplitRatio,
    session?.user,
    code,
    selectedLanguage,
    selectedGpuType,
    slug,
    HORIZONTAL_DEFAULT_RATIO,
    LEFT_CONSOLE_DEFAULT_RATIO,
    languageGpuError,
    toast,
  ]);

  // Cmd+Enter to submit
  useHotkey("meta+enter", () => {
    if (isSubmitting) {
      toast({
        title: "Already submitting",
        description: "Please wait for the submission to complete",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }
    void handleSubmit();
  });

  // Cmd+' to run sample
  useHotkey("meta+'", () => {
    if (isRunning) {
      toast({
        title: "Already running",
        description: "Please wait for the sample run to complete",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }
    void handleRun();
  });

  useHotkey("meta+shift+v", () => {
    setIsVimModeEnabled((prev) => !prev);
  });

  if (isLoading) {
    return (
      <Layout title="Loading...">
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          h="100%"
        >
          <Spinner size="xl" />
        </Box>
      </Layout>
    );
  }

  if (!problem) {
    return (
      <Layout title="Not Found">
        <Box p={8}>
          <Text>Problem not found</Text>
        </Box>
      </Layout>
    );
  }

  const leftInnerContent = (() => {
    switch (viewType) {
      case "submissions":
        return (
          <MySubmissions
            submissions={submissionsQuery.data?.submissions}
            isLoading={submissionsQuery.isLoading}
            onBackToProblem={() => setViewType("problem")}
          />
        );
      case "result":
        return metaStatus ? (
          <SubmissionResults
            metaStatus={metaStatus}
            metaResponse={metaResponse}
            testResults={testResults}
            benchmarkResults={benchmarkResults}
            isTestCaseTableOpen={isTestCaseTableOpen}
            setIsTestCaseTableOpen={setIsTestCaseTableOpen}
            isBenchmarking={isBenchmarking}
            totalTests={totalTests}
            getTypedResponse={getTypedResponse}
            onBackToProblem={() => setViewType("problem")}
            onViewSubmissions={() => setViewType("submissions")}
            submissionId={submissionId}
            onViewFlops={onFlopsModalOpen}
            hasFlopsCode={!!(problem as { getFlops?: string | null }).getFlops}
          />
        ) : null;
      default:
        return (
          <ProblemView
            problem={problem}
            onViewSubmissions={() => setViewType("submissions")}
          />
        );
    }
  })();

  const leftMainContent = (
    <Box h="100%" minH={0} overflow="hidden">
      <Box
        h="100%"
        minH={0}
        overflowY="auto"
        overflowX="hidden"
        pr={{ base: 0, md: 2 }}
        p={viewType === "problem" ? 3 : 0}
      >
        <Box w="100%" minW={0}>
          {leftInnerContent}
        </Box>
      </Box>
    </Box>
  );

  const leftContent = (
    <Box w="100%" h="100%" minH={0} overflow="hidden">
      <VerticalSplitPanel
        topContent={leftMainContent}
        bottomContent={
          <ResizableConsole
            output={consoleOutput}
            status={status}
            isRunning={isRunning}
          />
        }
        initialRatio={LEFT_CONSOLE_DEFAULT_RATIO}
        splitRatio={leftConsoleSplitRatio}
        onSplitRatioChange={setLeftConsoleSplitRatio}
        minTopHeight={0}
        minBottomHeight={0}
        allowCollapse
        snapOffsetPx={16}
        collapsedTopLabel="Problem"
        collapsedBottomLabel="Console"
      />
    </Box>
  );

  const gpuOptions = Object.entries(GPU_DISPLAY_NAMES).filter(
    ([key]) => key !== "all" && baseGpuOptions.includes(key)
  );
  const editorToolbar = (
    <HStack
      h="38px"
      px={1.5}
      spacing={1.5}
      pt={0}
      pb={1.5}
      bg="transparent"
      overflowX="auto"
      overflowY="hidden"
      css={{ scrollbarWidth: "none" }}
      sx={{ "&::-webkit-scrollbar": { display: "none" } }}
    >
      <Flex w="100%" minW="0" align="center" justify="space-between" gap={2}>
        <HStack spacing={1.5} flexShrink={0}>
          <HStack spacing={0.5} flexShrink={0}>
            <Menu>
              <MenuButton
                as={Button}
                size="sm"
                rightIcon={<FaChevronDown size={12} color="#a1a1aa" />}
                bg="whiteAlpha.50"
                _hover={{ bg: "whiteAlpha.100", borderColor: "gray.600" }}
                _active={{ bg: "whiteAlpha.150" }}
                _focus={{ borderColor: "blue.500", boxShadow: "none" }}
                color="white"
                h="30px"
                w={{ base: "140px", md: "176px" }}
                justifyContent="flex-start"
                textAlign="left"
                fontSize="sm"
                fontWeight="normal"
                borderRadius="lg"
                px={2.5}
                flexShrink={0}
              >
                {GPU_DISPLAY_NAMES[selectedGpuType]}
              </MenuButton>
              <MenuList
                bg="brand.secondary"
                borderColor="gray.800"
                p={0}
                minW="186px"
              >
                {gpuOptions.map(([key, value]) => {
                  const isDisabled = !isLanguageSupportedOnGpu(
                    selectedLanguage,
                    key
                  );
                  const disabledReason = getLanguageGpuSupportError(
                    selectedLanguage,
                    key
                  );
                  return (
                    <Tooltip
                      key={key}
                      label={disabledReason ?? ""}
                      isDisabled={!isDisabled}
                      placement="right"
                    >
                      <MenuItem
                        onClick={() => setSelectedGpuType(key)}
                        bg="brand.secondary"
                        _hover={{
                          bg: isDisabled ? "brand.secondary" : "gray.700",
                        }}
                        color={isDisabled ? "gray.500" : "white"}
                        borderRadius="md"
                        fontSize="sm"
                        isDisabled={isDisabled}
                      >
                        {value}
                      </MenuItem>
                    </Tooltip>
                  );
                })}
              </MenuList>
            </Menu>
            <GpuInfoModal compact />
          </HStack>

          <HStack spacing={0.5} flexShrink={0}>
            <Menu>
              <MenuButton
                as={Button}
                size="sm"
                rightIcon={<FaChevronDown size={12} color="#a1a1aa" />}
                bg="whiteAlpha.50"
                _hover={{ bg: "whiteAlpha.100", borderColor: "gray.600" }}
                _active={{ bg: "whiteAlpha.150" }}
                _focus={{ borderColor: "blue.500", boxShadow: "none" }}
                color="white"
                h="30px"
                w={{ base: "140px", md: "176px" }}
                justifyContent="flex-start"
                textAlign="left"
                fontSize="sm"
                fontWeight="normal"
                borderRadius="lg"
                px={2.5}
                flexShrink={0}
              >
                {LANGUAGE_DISPLAY_NAMES[selectedLanguage]}
              </MenuButton>
              <MenuList
                bg="brand.secondary"
                borderColor="gray.800"
                p={0}
                minW="186px"
              >
                <MenuItem
                  onClick={() => setSelectedLanguage("cuda")}
                  bg="brand.secondary"
                  _hover={{ bg: "gray.700" }}
                  color="white"
                  borderRadius="md"
                  fontSize="sm"
                >
                  CUDA C++
                </MenuItem>
                <MenuItem
                  onClick={() => setSelectedLanguage("python")}
                  bg="brand.secondary"
                  _hover={{ bg: "gray.700" }}
                  color="white"
                  borderRadius="md"
                  fontSize="sm"
                >
                  Triton
                </MenuItem>
                <Tooltip
                  label={
                    getLanguageGpuSupportError("pyptx", selectedGpuType) ?? ""
                  }
                  isDisabled={isLanguageSupportedOnGpu(
                    "pyptx",
                    selectedGpuType
                  )}
                  placement="right"
                >
                  <MenuItem
                    onClick={() => setSelectedLanguage("pyptx")}
                    bg="brand.secondary"
                    _hover={{
                      bg: isLanguageSupportedOnGpu("pyptx", selectedGpuType)
                        ? "gray.700"
                        : "brand.secondary",
                    }}
                    color={
                      isLanguageSupportedOnGpu("pyptx", selectedGpuType)
                        ? "white"
                        : "gray.500"
                    }
                    borderRadius="md"
                    fontSize="sm"
                    isDisabled={
                      !isLanguageSupportedOnGpu("pyptx", selectedGpuType)
                    }
                  >
                    PyPTX
                  </MenuItem>
                </Tooltip>
                <MenuItem
                  onClick={() => setSelectedLanguage("mojo")}
                  bg="brand.secondary"
                  _hover={{ bg: "gray.700" }}
                  color="white"
                  borderRadius="md"
                  fontSize="sm"
                >
                  Mojo
                </MenuItem>
                <MenuItem
                  onClick={() => setSelectedLanguage("cute")}
                  bg="brand.secondary"
                  _hover={{ bg: "gray.700" }}
                  color="white"
                  borderRadius="md"
                  fontSize="sm"
                >
                  CuTe DSL
                </MenuItem>
                <Tooltip
                  label={
                    getLanguageGpuSupportError("cutile", selectedGpuType) ?? ""
                  }
                  isDisabled={isLanguageSupportedOnGpu(
                    "cutile",
                    selectedGpuType
                  )}
                  placement="right"
                >
                  <MenuItem
                    onClick={() => setSelectedLanguage("cutile")}
                    bg="brand.secondary"
                    _hover={{
                      bg: isLanguageSupportedOnGpu("cutile", selectedGpuType)
                        ? "gray.700"
                        : "brand.secondary",
                    }}
                    color={
                      isLanguageSupportedOnGpu("cutile", selectedGpuType)
                        ? "white"
                        : "gray.500"
                    }
                    borderRadius="md"
                    fontSize="sm"
                    isDisabled={
                      !isLanguageSupportedOnGpu("cutile", selectedGpuType)
                    }
                  >
                    cuTile Python
                  </MenuItem>
                </Tooltip>
              </MenuList>
            </Menu>
            <LanguageInfoModal compact />
          </HStack>

          <LanguageResources language={selectedLanguage} />

          <Tooltip
            label={
              parameters.length > 0
                ? "View parameters"
                : "No parameters available"
            }
            hasArrow
            placement="bottom"
          >
            <IconButton
              aria-label="View parameters"
              icon={<FiList size={14} />}
              size="sm"
              variant="ghost"
              onClick={onParametersOpen}
              isDisabled={parameters.length === 0}
              borderRadius="lg"
              h="30px"
              minW="30px"
              color="gray.400"
              _hover={{
                color: "white",
              }}
            />
          </Tooltip>

          <Tooltip
            label={
              problem.referenceSolution
                ? "View reference"
                : "No reference available"
            }
            hasArrow
            placement="bottom"
          >
            <IconButton
              aria-label="View reference"
              icon={<FiBookOpen size={14} />}
              size="sm"
              variant="ghost"
              onClick={onOpen}
              isDisabled={!problem.referenceSolution}
              borderRadius="lg"
              h="30px"
              minW="30px"
              color="gray.400"
              _hover={{
                color: "white",
              }}
            />
          </Tooltip>

          {session?.user?.canUseProfiler && (
            <Popover placement="bottom-start">
              <PopoverTrigger>
                <IconButton
                  aria-label="Advanced profiling"
                  icon={<FiSliders size={14} />}
                  size="sm"
                  variant="ghost"
                  borderRadius="lg"
                  h="30px"
                  minW="30px"
                  color={isAdvancedProfilingEnabled ? "blue.300" : "gray.400"}
                  bg={isAdvancedProfilingEnabled ? "whiteAlpha.100" : undefined}
                  _hover={{
                    color: "white",
                  }}
                />
              </PopoverTrigger>
              <PopoverContent
                bg="brand.secondary"
                borderColor="gray.800"
                color="white"
                w="276px"
                _focus={{ boxShadow: "none" }}
              >
                <PopoverArrow bg="brand.secondary" />
                <PopoverBody p={3}>
                  <VStack align="stretch" spacing={3}>
                    <FormControl
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <FormLabel mb={0} fontSize="sm">
                        Advanced profiling
                      </FormLabel>
                      <Switch
                        size="sm"
                        isChecked={isAdvancedProfilingEnabled}
                        onChange={(event) =>
                          setIsAdvancedProfilingEnabled(event.target.checked)
                        }
                      />
                    </FormControl>

                    <HStack spacing={2}>
                      <FormControl>
                        <FormLabel fontSize="xs" color="gray.300">
                          Min runs
                        </FormLabel>
                        <NumberInput
                          size="sm"
                          min={1}
                          max={50}
                          value={profileMinIterations}
                          onChange={(_, value) =>
                            setProfileMinIterations(
                              Number.isFinite(value) ? value : 5
                            )
                          }
                          isDisabled={!isAdvancedProfilingEnabled}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="xs" color="gray.300">
                          Max runs
                        </FormLabel>
                        <NumberInput
                          size="sm"
                          min={1}
                          max={200}
                          value={profileMaxIterations}
                          onChange={(_, value) =>
                            setProfileMaxIterations(
                              Number.isFinite(value) ? value : 20
                            )
                          }
                          isDisabled={!isAdvancedProfilingEnabled}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>
                    </HStack>

                    <HStack spacing={2}>
                      <FormControl>
                        <FormLabel fontSize="xs" color="gray.300">
                          Target CV %
                        </FormLabel>
                        <NumberInput
                          size="sm"
                          min={0.1}
                          max={25}
                          precision={1}
                          step={0.1}
                          value={profileTargetCvPercent}
                          onChange={(_, value) =>
                            setProfileTargetCvPercent(
                              Number.isFinite(value) ? value : 1
                            )
                          }
                          isDisabled={!isAdvancedProfilingEnabled}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="xs" color="gray.300">
                          Sample ms
                        </FormLabel>
                        <NumberInput
                          size="sm"
                          min={1}
                          max={1000}
                          value={profileSampleIntervalMs}
                          onChange={(_, value) =>
                            setProfileSampleIntervalMs(
                              Number.isFinite(value) ? value : 5
                            )
                          }
                          isDisabled={!isAdvancedProfilingEnabled}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>
                    </HStack>

                    <FormControl>
                      <FormLabel fontSize="xs" color="gray.300">
                        Long-kernel threshold seconds
                      </FormLabel>
                      <NumberInput
                        size="sm"
                        min={0.01}
                        max={30}
                        precision={2}
                        step={0.1}
                        value={profileLongKernelThreshold}
                        onChange={(_, value) =>
                          setProfileLongKernelThreshold(
                            Number.isFinite(value) ? value : 1
                          )
                        }
                        isDisabled={!isAdvancedProfilingEnabled}
                      >
                        <NumberInputField />
                        <NumberInputStepper>
                          <NumberIncrementStepper />
                          <NumberDecrementStepper />
                        </NumberInputStepper>
                      </NumberInput>
                    </FormControl>

                    <FormControl
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <FormLabel mb={0} fontSize="xs" color="gray.300">
                        Store raw NVML samples
                      </FormLabel>
                      <Switch
                        size="sm"
                        isChecked={profileIncludeRawSamples}
                        onChange={(event) =>
                          setProfileIncludeRawSamples(event.target.checked)
                        }
                        isDisabled={!isAdvancedProfilingEnabled}
                      />
                    </FormControl>

                    <FormControl
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <FormLabel mb={0} fontSize="xs" color="gray.300">
                        CUDA kernel trace
                      </FormLabel>
                      <Switch
                        size="sm"
                        isChecked={profileIncludeCudaKernelProfile}
                        onChange={(event) =>
                          setProfileIncludeCudaKernelProfile(
                            event.target.checked
                          )
                        }
                        isDisabled={
                          !isAdvancedProfilingEnabled ||
                          selectedLanguage !== "cuda"
                        }
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel fontSize="xs" color="gray.300">
                        Kernel trace rows
                      </FormLabel>
                      <NumberInput
                        size="sm"
                        min={1}
                        max={100}
                        value={profileCudaKernelProfileTopK}
                        onChange={(_, value) =>
                          setProfileCudaKernelProfileTopK(
                            Number.isFinite(value) ? value : 25
                          )
                        }
                        isDisabled={
                          !isAdvancedProfilingEnabled ||
                          !profileIncludeCudaKernelProfile ||
                          selectedLanguage !== "cuda"
                        }
                      >
                        <NumberInputField />
                        <NumberInputStepper>
                          <NumberIncrementStepper />
                          <NumberDecrementStepper />
                        </NumberInputStepper>
                      </NumberInput>
                    </FormControl>
                  </VStack>
                </PopoverBody>
              </PopoverContent>
            </Popover>
          )}
        </HStack>

        <HStack spacing={1.5} flexShrink={0}>
          {selectedLanguage === "cuda" && hasPtxOrSass && (
            <Box flexShrink={0}>
              <Button
                size="sm"
                variant="ghost"
                borderRadius="lg"
                h="30px"
                fontSize="xs"
                fontWeight="normal"
                color={isPtxSassOpen ? "white" : "gray.300"}
                px={3}
                onClick={() => setIsPtxSassOpen((prev) => !prev)}
                _hover={{
                  bg: "whiteAlpha.50",
                  color: "white",
                }}
              >
                {isPtxSassOpen ? "Hide PTX/SASS" : "View PTX/SASS"}
              </Button>
            </Box>
          )}
          {isCodeDirty && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsResetModalOpen(true)}
              borderRadius="lg"
              h="30px"
              fontSize="xs"
              fontWeight="semibold"
              color="gray.300"
              leftIcon={<IoRepeat size={15} />}
              iconSpacing={2}
              px={3}
              _hover={{
                bg: "whiteAlpha.50",
                color: "white",
              }}
            >
              Reset Code
            </Button>
          )}

          <IconButton
            aria-label="Toggle Vim mode"
            icon={
              <Text fontSize="xs" fontWeight="500">
                Vim
              </Text>
            }
            size="sm"
            variant="ghost"
            onClick={() => setIsVimModeEnabled((prev) => !prev)}
            borderRadius="lg"
            h="30px"
            minW="36px"
            color={isVimModeEnabled ? "#63D297" : "gray.300"}
            _hover={{
              bg: "rgba(72, 187, 120, 0.16)",
              color: "#63D297",
            }}
          />
        </HStack>
      </Flex>
    </HStack>
  );

  const headerToolbar = (
    <HStack justify="flex-end" spacing={2}>
      <Tooltip
        label="⌘ + '"
        placement="bottom"
        bg="transparent"
        color="gray.400"
        fontSize="xs"
        hasArrow
      >
        <Button
          bg="rgba(59, 130, 246, 0.1)"
          color="rgb(59, 130, 246)"
          size="sm"
          onClick={handleRun}
          isLoading={isRunning}
          loadingText="Run"
          spinner={<></>}
          disabled={isRunning || !!languageGpuError}
          borderRadius="lg"
          h="32px"
          fontSize="sm"
          fontWeight="semibold"
          px={4}
          minW="68px"
          _hover={{
            bg: "rgba(59, 130, 246, 0.2)",
            transform: "translateY(-1px)",
          }}
          _active={{
            bg: "rgba(59, 130, 246, 0.25)",
          }}
        >
          Run
        </Button>
      </Tooltip>
      <Tooltip
        label="⌘ + ⏎"
        placement="bottom"
        bg="transparent"
        color="gray.400"
        fontSize="xs"
        hasArrow
      >
        <Button
          bg="rgba(34, 197, 94, 0.1)"
          color="rgb(34, 197, 94)"
          size="sm"
          onClick={handleSubmit}
          isLoading={isSubmitting}
          loadingText="Submit"
          spinner={<></>}
          disabled={isSubmitting || !!languageGpuError}
          borderRadius="lg"
          h="32px"
          fontSize="sm"
          fontWeight="semibold"
          px={4}
          minW="78px"
          _hover={{
            bg: "rgba(34, 197, 94, 0.2)",
            transform: "translateY(-1px)",
          }}
          _active={{
            bg: "rgba(34, 197, 94, 0.25)",
          }}
        >
          Submit
        </Button>
      </Tooltip>
    </HStack>
  );

  const rightContent = (
    <Box w="100%" h="100%" minH={0} overflow="hidden">
      <CodeEditor
        key={`problem-editor-${isVimModeEnabled ? "vim" : "std"}`}
        code={code}
        setCode={handleSetCode}
        selectedLanguage={selectedLanguage}
        toolbar={editorToolbar}
        codeFontSize={12}
        enableVimMode={isVimModeEnabled}
        ptxContent={
          submissionPtxTimestamp > samplePtxTimestamp
            ? (submissionPtxContent ?? ptxContent)
            : (ptxContent ?? submissionPtxContent)
        }
        sassContent={
          submissionSassTimestamp > sampleSassTimestamp
            ? (submissionSassContent ?? sassContent)
            : (sassContent ?? submissionSassContent)
        }
        enablePtxSassView={selectedLanguage === "cuda"}
        ptxDirty={ptxDirty}
        sassDirty={sassDirty}
        isPtxSassOpen={isPtxSassOpen}
        onPtxSassOpenChange={setIsPtxSassOpen}
      />
    </Box>
  );

  // Mobile warning
  const mobileWarning = (
    <Box
      display={{ base: "block", md: "none" }}
      w="100%"
      p={6}
      bg="whiteAlpha.50"
      borderRadius="xl"
      mb={4}
    >
      <VStack spacing={4} align="center">
        <Icon as={FaExclamationCircle} boxSize={10} color="yellow.400" />
        <Heading size="md" textAlign="center">
          Desktop Required for Code Submission
        </Heading>
        <Text textAlign="center" color="whiteAlpha.800">
          For the best coding experience, please switch to a desktop device to
          write and submit your solution.
        </Text>
      </VStack>
    </Box>
  );

  return (
    <Layout
      title={problem.title}
      ogTitle={`${problem.title}`}
      ogImgSubtitle={`${problem.difficulty.charAt(0) + problem.difficulty.toLowerCase().slice(1)} | Problems | Tensara`}
      isCodingMode
      headerToolbar={headerToolbar}
    >
      <Box
        bg="brand.secondary"
        borderRadius="xl"
        border="1px solid"
        borderColor="gray.800"
        h="100%"
        p={{ base: 2, md: 2 }}
        overflow="hidden"
        display="flex"
        flexDirection="column"
        minH={0}
      >
        <Box flex="1" overflow="hidden" mb={2} minH={0}>
          <SplitPanel
            containerId={splitContainerId}
            leftContent={leftContent}
            rightContent={rightContent}
            initialRatio={HORIZONTAL_DEFAULT_RATIO}
            splitRatio={horizontalSplitRatio}
            onSplitRatioChange={setHorizontalSplitRatio}
            minLeftWidth={28}
            minRightWidth={0}
            allowCollapse
            snapOffsetPx={18}
            resizerLineInsetTopPx={0}
            collapsedLeftLabel="Problem"
            collapsedRightLabel="Editor"
          />
        </Box>
        {mobileWarning}
        <ResetCodeModal
          isOpen={isResetModalOpen}
          onClose={() => setIsResetModalOpen(false)}
          onReset={handleReset}
        />
        <Modal isOpen={isOpen} onClose={onClose} isCentered size="4xl">
          <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(5px)" />
          <ModalContent
            bg="brand.secondary"
            borderColor="whiteAlpha.100"
            borderWidth={1}
          >
            <ModalHeader color="white">Reference Solution</ModalHeader>
            <ModalCloseButton color="gray.400" />
            <ModalBody pb={6}>
              {problem.referenceSolution && (
                <Box>
                  {(() => {
                    const lines = problem.referenceSolution.split("\n").length;
                    const height = Math.min(lines * 20 + 100, 600);
                    return (
                      <Editor
                        height={height}
                        language="python"
                        value={problem.referenceSolution}
                        theme="tensara-dark"
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 14,
                          lineNumbers: "on",
                          scrollBeyondLastLine: false,
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                      />
                    );
                  })()}
                </Box>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>
        <Modal
          isOpen={isParametersOpen}
          onClose={onParametersClose}
          isCentered
          size="2xl"
        >
          <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(5px)" />
          <ModalContent
            bg="brand.secondary"
            borderColor="whiteAlpha.100"
            borderWidth={1}
          >
            <ModalHeader color="white">Function Parameters</ModalHeader>
            <ModalCloseButton color="gray.400" />
            <ModalBody pb={6}>
              {parameters.length === 0 ? (
                <Text color="gray.300">
                  This solution function takes no parameters.
                </Text>
              ) : (
                <VStack spacing={2} align="stretch">
                  <Text
                    color="gray.500"
                    fontSize="xs"
                    textTransform="uppercase"
                  >
                    Signature
                  </Text>
                  <Text
                    color="teal.200"
                    fontFamily="JetBrains Mono, monospace"
                    fontSize="sm"
                    whiteSpace="pre-wrap"
                    mb={1}
                  >
                    {parameterSignature}
                  </Text>
                  {parameters.map((parameter, index) => (
                    <HStack
                      key={`${parameter.name}-${index}`}
                      justify="space-between"
                      align="center"
                      py={2}
                      borderBottomWidth={
                        index === parameters.length - 1 ? "0" : "1px"
                      }
                      borderColor="whiteAlpha.200"
                    >
                      <Text
                        color="white"
                        fontWeight="medium"
                        fontFamily="JetBrains Mono, monospace"
                        fontSize="sm"
                      >
                        {parameter.name}
                        <Text as="span" color="gray.400">
                          {": "}
                        </Text>
                        <Text as="span" color="gray.300" fontWeight="normal">
                          {getParameterDisplayType(parameter)}
                        </Text>
                      </Text>
                      <HStack spacing={1.5}>
                        {hasFlag(parameter.const) && (
                          <Badge
                            colorScheme="green"
                            borderRadius="md"
                            py={0.5}
                            px={2}
                          >
                            const
                          </Badge>
                        )}
                        {hasFlag(parameter.pointer) && (
                          <Badge
                            colorScheme="red"
                            borderRadius="md"
                            py={0.5}
                            px={2}
                          >
                            pointer
                          </Badge>
                        )}
                      </HStack>
                    </HStack>
                  ))}
                </VStack>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>
        <FlopsModal
          isOpen={isFlopsModalOpen}
          onClose={onFlopsModalClose}
          problemSlug={problem.slug}
          getFlops={(problem as { getFlops?: string | null }).getFlops}
        />
      </Box>
    </Layout>
  );
}
