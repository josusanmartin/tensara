import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
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
import { FiLogIn } from "react-icons/fi";

import { Layout } from "~/components/layout";

const getQueryString = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      username,
      password,
      callbackUrl,
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Invalid username, email, or password");
      return;
    }

    await router.push(result?.url ?? callbackUrl);
  };

  return (
    <Layout title="Sign In">
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
          maxW="420px"
          borderWidth="1px"
          borderColor="whiteAlpha.200"
          borderRadius="lg"
          bg="rgba(15, 23, 42, 0.72)"
          p={{ base: 6, md: 8 }}
        >
          <VStack spacing={5} align="stretch">
            <Box>
              <Heading size="lg" color="white">
                Sign in
              </Heading>
              <Text color="gray.400" mt={2}>
                Use your Tensara account to submit kernels and save workspaces.
              </Text>
            </Box>

            {error ? (
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                {error}
              </Alert>
            ) : null}

            <FormControl isRequired>
              <FormLabel color="gray.200">Username or email</FormLabel>
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                bg="whiteAlpha.100"
                borderColor="whiteAlpha.300"
                color="white"
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel color="gray.200">Password</FormLabel>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                bg="whiteAlpha.100"
                borderColor="whiteAlpha.300"
                color="white"
              />
            </FormControl>

            <Button
              type="submit"
              leftIcon={<FiLogIn />}
              bg="#0e8144"
              color="white"
              isLoading={isSubmitting}
              _hover={{ bg: "#0a6434" }}
            >
              Sign in
            </Button>

            <Text color="gray.400" textAlign="center" fontSize="sm">
              Need an account?{" "}
              <ChakraLink
                as={Link}
                href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
                color="#2ecc71"
                fontWeight="semibold"
              >
                Register
              </ChakraLink>
            </Text>
          </VStack>
        </Box>
      </Box>
    </Layout>
  );
}
