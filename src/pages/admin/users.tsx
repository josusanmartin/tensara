import type { GetServerSideProps } from "next";
import { useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Heading,
  Input,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  useToast,
} from "@chakra-ui/react";

import { Layout } from "~/components/layout";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

type AdminUser = {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  isAdmin: boolean;
  isActive: boolean;
  canUseProfiler: boolean;
  createdAt: string;
  lastLogin: string | null;
  _count: {
    submissions: number;
    ApiKey: number;
  };
};

type NewUserForm = {
  username: string;
  name: string;
  email: string;
  password: string;
  isAdmin: boolean;
  isActive: boolean;
  canUseProfiler: boolean;
};

const emptyForm: NewUserForm = {
  username: "",
  name: "",
  email: "",
  password: "",
  isAdmin: false,
  isActive: true,
  canUseProfiler: false,
};

const requestJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context.req, context.res);
  if (!session) {
    return {
      redirect: { destination: "/api/auth/signin", permanent: false },
    };
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, isActive: true },
  });

  if (!user?.isActive || !user.isAdmin) {
    return { notFound: true };
  }

  return { props: {} };
};

export default function AdminUsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [form, setForm] = useState<NewUserForm>(emptyForm);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await requestJson<{ users: AdminUser[] }>(
        "/api/admin/users"
      );
      setUsers(data.users);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load users",
        status: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const createUser = async () => {
    setIsSaving(true);
    try {
      await requestJson<{ user: AdminUser }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          name: form.name || undefined,
        }),
      });
      setForm(emptyForm);
      await loadUsers();
      toast({ title: "User created", status: "success" });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to create user",
        status: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateUser = async (id: string, data: Record<string, unknown>) => {
    try {
      await requestJson<{ user: AdminUser }>(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      await loadUsers();
      toast({ title: "User updated", status: "success" });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to update user",
        status: "error",
      });
    }
  };

  const resetPassword = async (user: AdminUser) => {
    const password = passwords[user.id] ?? "";
    if (!password) return;
    await updateUser(user.id, { password });
    setPasswords((current) => ({ ...current, [user.id]: "" }));
  };

  const deactivateUser = async (user: AdminUser) => {
    try {
      await requestJson<void>(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      await loadUsers();
      toast({ title: "User disabled", status: "success" });
    } catch (error) {
      toast({
        title:
          error instanceof Error ? error.message : "Failed to disable user",
        status: "error",
      });
    }
  };

  return (
    <Layout title="User Management" ogTitle="User Management">
      <Box maxW="1400px" mx="auto" py={6}>
        <HStack justify="space-between" align="start" mb={6}>
          <Box>
            <Heading size="lg" color="white">
              User Management
            </Heading>
            <Text color="gray.300" mt={1}>
              Manage local Tensara accounts, admin access, and profiler access.
            </Text>
          </Box>
          <Button onClick={loadUsers} isLoading={isLoading} size="sm">
            Refresh
          </Button>
        </HStack>

        <Box bg="whiteAlpha.100" borderRadius="md" p={4} mb={6}>
          <Heading size="sm" color="white" mb={4}>
            Create User
          </Heading>
          <VStack align="stretch" spacing={4}>
            <HStack align="start" spacing={3} flexWrap="wrap">
              <FormControl maxW="220px">
                <FormLabel color="gray.300" fontSize="sm">
                  Username
                </FormLabel>
                <Input
                  value={form.username}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                  color="white"
                />
              </FormControl>
              <FormControl maxW="220px">
                <FormLabel color="gray.300" fontSize="sm">
                  Name
                </FormLabel>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  color="white"
                />
              </FormControl>
              <FormControl maxW="260px">
                <FormLabel color="gray.300" fontSize="sm">
                  Email
                </FormLabel>
                <Input
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  color="white"
                />
              </FormControl>
              <FormControl maxW="240px">
                <FormLabel color="gray.300" fontSize="sm">
                  Password
                </FormLabel>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  color="white"
                />
              </FormControl>
            </HStack>
            <HStack spacing={6} flexWrap="wrap">
              <FormControl display="flex" alignItems="center" w="auto">
                <FormLabel color="gray.300" fontSize="sm" mb={0}>
                  Active
                </FormLabel>
                <Switch
                  isChecked={form.isActive}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                />
              </FormControl>
              <FormControl display="flex" alignItems="center" w="auto">
                <FormLabel color="gray.300" fontSize="sm" mb={0}>
                  Admin
                </FormLabel>
                <Switch
                  isChecked={form.isAdmin}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isAdmin: event.target.checked,
                    }))
                  }
                />
              </FormControl>
              <FormControl display="flex" alignItems="center" w="auto">
                <FormLabel color="gray.300" fontSize="sm" mb={0}>
                  Profiler
                </FormLabel>
                <Switch
                  isChecked={form.canUseProfiler}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      canUseProfiler: event.target.checked,
                    }))
                  }
                />
              </FormControl>
              <Button
                colorScheme="blue"
                onClick={createUser}
                isLoading={isSaving}
              >
                Create
              </Button>
            </HStack>
          </VStack>
        </Box>

        <Box bg="whiteAlpha.100" borderRadius="md" overflowX="auto">
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th color="gray.300">User</Th>
                <Th color="gray.300">Access</Th>
                <Th color="gray.300">Usage</Th>
                <Th color="gray.300">Last Login</Th>
                <Th color="gray.300">Reset Password</Th>
                <Th color="gray.300">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {users.map((user) => (
                <Tr key={user.id}>
                  <Td color="white">
                    <Text fontWeight="semibold">{user.username}</Text>
                    <Text color="gray.400" fontSize="xs">
                      {user.email}
                    </Text>
                  </Td>
                  <Td>
                    <HStack spacing={3} flexWrap="wrap">
                      <Badge colorScheme={user.isActive ? "green" : "red"}>
                        {user.isActive ? "Active" : "Disabled"}
                      </Badge>
                      <FormControl display="flex" alignItems="center" w="auto">
                        <FormLabel color="gray.300" fontSize="xs" mb={0}>
                          Admin
                        </FormLabel>
                        <Switch
                          size="sm"
                          isChecked={user.isAdmin}
                          onChange={(event) =>
                            updateUser(user.id, {
                              isAdmin: event.target.checked,
                            })
                          }
                        />
                      </FormControl>
                      <FormControl display="flex" alignItems="center" w="auto">
                        <FormLabel color="gray.300" fontSize="xs" mb={0}>
                          Profiler
                        </FormLabel>
                        <Switch
                          size="sm"
                          isChecked={user.canUseProfiler}
                          onChange={(event) =>
                            updateUser(user.id, {
                              canUseProfiler: event.target.checked,
                            })
                          }
                        />
                      </FormControl>
                      <FormControl display="flex" alignItems="center" w="auto">
                        <FormLabel color="gray.300" fontSize="xs" mb={0}>
                          Active
                        </FormLabel>
                        <Switch
                          size="sm"
                          isChecked={user.isActive}
                          onChange={(event) =>
                            updateUser(user.id, {
                              isActive: event.target.checked,
                            })
                          }
                        />
                      </FormControl>
                    </HStack>
                  </Td>
                  <Td color="gray.300">
                    <Text>{user._count.submissions} submissions</Text>
                    <Text fontSize="xs">{user._count.ApiKey} API keys</Text>
                  </Td>
                  <Td color="gray.300">
                    {user.lastLogin
                      ? new Date(user.lastLogin).toLocaleString()
                      : "Never"}
                  </Td>
                  <Td>
                    <HStack>
                      <Input
                        type="password"
                        size="sm"
                        value={passwords[user.id] ?? ""}
                        onChange={(event) =>
                          setPasswords((current) => ({
                            ...current,
                            [user.id]: event.target.value,
                          }))
                        }
                        color="white"
                        placeholder="New password"
                      />
                      <Button
                        size="sm"
                        onClick={() => resetPassword(user)}
                        isDisabled={(passwords[user.id] ?? "").length < 8}
                      >
                        Set
                      </Button>
                    </HStack>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      colorScheme="red"
                      variant="outline"
                      onClick={() => deactivateUser(user)}
                      isDisabled={!user.isActive}
                    >
                      Disable
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      </Box>
    </Layout>
  );
}
