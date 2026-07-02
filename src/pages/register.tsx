import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  Input,
  Link as ChakraLink,
  Text,
  VStack,
} from "@chakra-ui/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { FiUserPlus } from "react-icons/fi";

import { Layout } from "~/components/layout";

const getQueryString = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default function RegisterPage() {
  const router = useRouter();
  const { status } = useSession();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verifyPassword, setVerifyPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const callbackUrl = getQueryString(router.query.callbackUrl) ?? "/";

  useEffect(() => {
    if (status === "authenticated") {
      void router.replace(callbackUrl);
    }
  }, [callbackUrl, router, status]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (password !== verifyPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email,
        password,
        verifyPassword,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? `Registration failed with ${response.status}`);
      setIsSubmitting(false);
      return;
    }

    const result = await signIn("credentials", {
      username,
      password,
      callbackUrl,
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error) {
      await router.push(
        `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
      );
      return;
    }

    await router.push(result?.url ?? callbackUrl);
  };

  return (
    <Layout title="Register">
      <Box
        minH="70vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
        px={{ base: 2, md: 4 }}
      >
        <Box
          as="form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            void submit(event);
          }}
          w="full"
          maxW="460px"
          borderWidth="1px"
          borderColor="whiteAlpha.200"
          borderRadius="lg"
          bg="rgba(15, 23, 42, 0.72)"
          p={{ base: 6, md: 8 }}
        >
          <VStack spacing={5} align="stretch">
            <Box>
              <Heading size="lg" color="white">
                Register
              </Heading>
              <Text color="gray.400" mt={2}>
                Create a Tensara account for submissions and saved workspaces.
              </Text>
            </Box>

            {error ? (
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                {error}
              </Alert>
            ) : null}

            <FormControl isRequired>
              <FormLabel color="gray.200">Username</FormLabel>
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                bg="whiteAlpha.100"
                borderColor="whiteAlpha.300"
                color="white"
              />
              <FormHelperText color="gray.500">
                Letters, numbers, underscore, or dash. 3-32 characters.
              </FormHelperText>
            </FormControl>

            <FormControl>
              <FormLabel color="gray.200">Email</FormLabel>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                bg="whiteAlpha.100"
                borderColor="whiteAlpha.300"
                color="white"
              />
              <FormHelperText color="gray.500">
                Optional. Each email can only be used by one account.
              </FormHelperText>
            </FormControl>

            <FormControl isRequired>
              <FormLabel color="gray.200">Password</FormLabel>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                bg="whiteAlpha.100"
                borderColor="whiteAlpha.300"
                color="white"
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel color="gray.200">Verify password</FormLabel>
              <Input
                type="password"
                value={verifyPassword}
                onChange={(event) => setVerifyPassword(event.target.value)}
                autoComplete="new-password"
                bg="whiteAlpha.100"
                borderColor="whiteAlpha.300"
                color="white"
              />
            </FormControl>

            <Button
              type="submit"
              leftIcon={<FiUserPlus />}
              bg="#0e8144"
              color="white"
              isLoading={isSubmitting}
              _hover={{ bg: "#0a6434" }}
            >
              Register
            </Button>

            <Text color="gray.400" textAlign="center" fontSize="sm">
              Already have an account?{" "}
              <ChakraLink
                as={Link}
                href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
                color="#2ecc71"
                fontWeight="semibold"
              >
                Sign in
              </ChakraLink>
            </Text>
          </VStack>
        </Box>
      </Box>
    </Layout>
  );
}
