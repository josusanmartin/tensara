import { Difficulty, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type KernelBenchProblem = {
  slug: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  definition: string;
};

const SOURCE_NOTE =
  "Adapted from [ScalingIntelligence/KernelBench](https://github.com/ScalingIntelligence/KernelBench) Level 1 PyTorch operator tasks.";

const SOFTSIGN_DESCRIPTION = `${SOURCE_NOTE}

Implement the Softsign activation for a contiguous 2D float32 tensor flattened as a 1D array.

For every element \`x[i]\`, compute:

\`\`\`
output[i] = x[i] / (1.0 + abs(x[i]))
\`\`\`

## Function Signature

\`\`\`cpp
extern "C" void solution(const float* input, float* output, size_t n);
\`\`\`

## Inputs

- \`input\`: pointer to \`n\` contiguous \`float32\` values.
- \`output\`: pointer to \`n\` contiguous \`float32\` values that you must write.
- \`n\`: total number of elements, equal to \`rows * cols\` for the benchmark case.

## Benchmark Cases

The hidden benchmark uses five dense tensors:

- \`4096 x 4096\`
- \`6144 x 4096\`
- \`4096 x 7168\`
- \`4096 x 8192\`
- \`8192 x 8192\`

Input values are sampled from a normal distribution and scaled by \`4.0\`, so both positive and negative values are expected.

## Correctness

Your result is compared against PyTorch's equivalent expression \`x / (1 + abs(x))\` using \`rtol=1e-4\` and \`atol=1e-5\`.

## Notes

This is a memory-bandwidth-oriented elementwise kernel. Each output element is independent, so a simple grid-stride loop is a good baseline.`;

const HARD_TANH_DESCRIPTION = `${SOURCE_NOTE}

Implement the HardTanh activation for a contiguous 2D float32 tensor flattened as a 1D array.

For every element \`x[i]\`, compute:

\`\`\`
output[i] = min(max(x[i], -1.0), 1.0)
\`\`\`

## Function Signature

\`\`\`cpp
extern "C" void solution(const float* input, float* output, size_t n);
\`\`\`

## Inputs

- \`input\`: pointer to \`n\` contiguous \`float32\` values.
- \`output\`: pointer to \`n\` contiguous \`float32\` values that you must write.
- \`n\`: total number of elements, equal to \`rows * cols\`.

## Benchmark Cases

- \`4096 x 4096\`
- \`6144 x 4096\`
- \`4096 x 7168\`
- \`4096 x 8192\`
- \`8192 x 8192\`

Input values are sampled from a normal distribution and scaled by \`3.0\`, so many values lie outside the clamp range.

## Correctness

Your result is compared against \`torch.clamp(x, min=-1.0, max=1.0)\` using \`rtol=1e-6\` and \`atol=1e-6\`.

## Notes

This should be implemented as a single pass over memory. Avoid branching-heavy code when simple min/max operations are enough.`;

const INSTANCE_NORM_DESCRIPTION = `${SOURCE_NOTE}

Implement 2D instance normalization for an \`NCHW\` float32 tensor.

For each independent \`(n, c)\` instance, normalize across the spatial dimensions \`H * W\`:

\`\`\`
mean[n,c] = sum(input[n,c,h,w]) / (H * W)
var[n,c]  = sum((input[n,c,h,w] - mean[n,c])^2) / (H * W)
output[n,c,h,w] = (input[n,c,h,w] - mean[n,c]) / sqrt(var[n,c] + epsilon)
\`\`\`

There is no affine scale or bias.

## Function Signature

\`\`\`cpp
extern "C" void solution(
    const float* input,
    float* output,
    size_t N,
    size_t C,
    size_t H,
    size_t W,
    float epsilon
);
\`\`\`

## Tensor Layout

The tensor is contiguous in row-major \`NCHW\` order:

\`\`\`
index = ((n * C + c) * H + h) * W + w
\`\`\`

## Benchmark Cases

- \`N=16, C=64, H=64, W=64\`
- \`N=8, C=128, H=64, W=64\`
- \`N=16, C=128, H=32, W=64\`
- \`N=32, C=32, H=128, W=64\`
- \`N=4, C=256, H=64, W=64\`

\`epsilon = 1e-5\` for all cases.

## Correctness

Your result is compared against PyTorch \`F.instance_norm(..., use_input_stats=True, eps=1e-5)\` with no running stats, weight, or bias. Tolerance is \`rtol=1e-4\`, \`atol=1e-4\`.

## Notes

A correct solution usually needs at least one reduction for the mean and one for the variance per \`(n, c)\` pair. The spatial size is large enough that parallel reductions matter.`;

const GROUP_NORM_DESCRIPTION = `${SOURCE_NOTE}

Implement 2D group normalization for a contiguous \`NCHW\` float32 tensor.

For each sample \`n\` and channel group \`g\`, normalize over all channels in that group and all spatial positions:

\`\`\`
channels_per_group = C / groups
group_size = channels_per_group * H * W

mean[n,g] = sum(group_values) / group_size
var[n,g]  = sum((group_values - mean[n,g])^2) / group_size
output = (input - mean[n,g]) / sqrt(var[n,g] + epsilon)
\`\`\`

There is no affine scale or bias.

## Function Signature

\`\`\`cpp
extern "C" void solution(
    const float* input,
    float* output,
    size_t N,
    size_t C,
    size_t H,
    size_t W,
    int groups,
    float epsilon
);
\`\`\`

## Tensor Layout

The tensor is contiguous in row-major \`NCHW\` order:

\`\`\`
index = ((n * C + c) * H + h) * W + w
group = c / (C / groups)
\`\`\`

## Benchmark Cases

- \`N=16, C=64, H=64, W=64, groups=8\`
- \`N=8, C=128, H=64, W=64, groups=16\`
- \`N=16, C=96, H=48, W=64, groups=12\`
- \`N=32, C=32, H=128, W=64, groups=8\`
- \`N=4, C=256, H=64, W=64, groups=32\`

\`epsilon = 1e-5\` for all cases.

## Correctness

Your result is compared against PyTorch \`F.group_norm(input, num_groups=groups, weight=None, bias=None, eps=1e-5)\`. Tolerance is \`rtol=1e-4\`, \`atol=1e-4\`.

## Notes

This is a reduction-heavy normalization problem. A common approach is to compute one mean/variance pair per \`(N, group)\`, then normalize every element in that group.`;

const CROSS_ENTROPY_DESCRIPTION = `${SOURCE_NOTE}

Implement mean cross entropy loss for a batch of class logits and integer class labels.

For each row \`i\`, with target class \`labels[i]\`, compute:

\`\`\`
row_max = max_j logits[i, j]
log_sum_exp = log(sum_j exp(logits[i, j] - row_max)) + row_max
loss_i = log_sum_exp - logits[i, labels[i]]
output[0] = mean_i(loss_i)
\`\`\`

Use the numerically stable log-sum-exp formulation above. The output is a single scalar.

## Function Signature

\`\`\`cpp
extern "C" void solution(
    const float* logits,
    const int* labels,
    float* output,
    size_t N,
    size_t C
);
\`\`\`

## Inputs

- \`logits\`: contiguous \`N x C\` float32 matrix.
- \`labels\`: contiguous length-\`N\` int32 vector. Each label is in \`[0, C)\`.
- \`output\`: one float32 scalar. Write the mean loss to \`output[0]\`.
- \`N\`: batch size.
- \`C\`: number of classes.

## Benchmark Cases

- \`N=8192, C=256\`
- \`N=16384, C=512\`
- \`N=32768, C=256\`
- \`N=8192, C=1024\`
- \`N=4096, C=2048\`

## Correctness

Your result is compared against \`torch.nn.functional.cross_entropy(logits, labels, reduction="mean")\` using \`rtol=1e-4\` and \`atol=1e-4\`.

## Notes

Do not compute \`exp(logits)\` directly without subtracting the row maximum; that can overflow. A performant solution usually reduces each row, accumulates losses, then reduces the batch loss to one scalar.`;

const MASKED_CUMSUM_DESCRIPTION = `${SOURCE_NOTE}

Implement an inclusive cumulative sum over a masked 1D float32 vector.

First apply the uint8 mask:

\`\`\`
masked[i] = mask[i] ? input[i] : 0.0
\`\`\`

Then compute the inclusive prefix sum:

\`\`\`
output[i] = masked[0] + masked[1] + ... + masked[i]
\`\`\`

## Function Signature

\`\`\`cpp
extern "C" void solution(
    const float* input,
    const uint8_t* mask,
    float* output,
    size_t n
);
\`\`\`

## Inputs

- \`input\`: pointer to \`n\` contiguous \`float32\` values.
- \`mask\`: pointer to \`n\` contiguous \`uint8_t\` values. Nonzero means include the input value.
- \`output\`: pointer to \`n\` contiguous \`float32\` values that you must write.
- \`n\`: total number of elements.

## Benchmark Cases

- \`n=1,048,576\`, mask density \`0.25\`
- \`n=2,097,152\`, mask density \`0.50\`
- \`n=4,194,304\`, mask density \`0.75\`
- \`n=8,388,608\`, mask density \`0.40\`
- \`n=16,777,216\`, mask density \`0.60\`

## Correctness

Your result is compared against:

\`\`\`python
masked = torch.where(mask.bool(), input, torch.zeros_like(input))
torch.cumsum(masked, dim=0)
\`\`\`

Tolerance is \`rtol=1e-4\`, \`atol=1e-3\`.

## Notes

This is a parallel prefix-scan problem. A single serial loop will be correct but slow. Efficient implementations usually combine block-level scans with a second pass over block sums.`;

const SOFTSIGN = String.raw`
import torch
from typing import List, Dict, Tuple, Any

from problem import Problem

class softsign(Problem):
    """KernelBench Level 1 Softsign activation."""

    is_exact = False

    parameters = [
        {"name": "input", "type": "float", "pointer": True, "const": True},
        {"name": "output", "type": "float", "pointer": True, "const": False},
        {"name": "n", "type": "size_t", "pointer": False, "const": False},
    ]

    def __init__(self):
        super().__init__(name="softsign")

    def reference_solution(self, input_tensor: torch.Tensor) -> torch.Tensor:
        return input_tensor / (1.0 + torch.abs(input_tensor))

    def _case(self, name: str, rows: int, cols: int) -> Dict[str, Any]:
        n = rows * cols
        seed = Problem.get_seed(f"{self.name}_{name}_{rows}_{cols}")
        dtype = self.param_dtype(0)
        return {
            "name": name,
            "n": n,
            "create_inputs": lambda rows=rows, cols=cols, seed=seed, dtype=dtype: (
                *(lambda g: (
                    torch.randn((rows, cols), device="cuda", dtype=dtype, generator=g) * 4.0,
                ))(torch.Generator(device="cuda").manual_seed(seed)),
            ),
        }

    def generate_test_cases(self) -> List[Dict[str, Any]]:
        return [
            self._case("4096x4096", 4096, 4096),
            self._case("6144x4096", 6144, 4096),
            self._case("4096x7168", 4096, 7168),
            self._case("4096x8192", 4096, 8192),
            self._case("8192x8192", 8192, 8192),
        ]

    def generate_sample(self) -> Dict[str, Any]:
        return self._case("sample_4x8", 4, 8)

    def verify_result(self, expected_output: torch.Tensor, actual_output: torch.Tensor) -> Tuple[bool, Dict[str, Any]]:
        is_close = torch.allclose(expected_output, actual_output, rtol=1e-4, atol=1e-5)
        max_diff = torch.max(torch.abs(expected_output - actual_output)).item()
        return is_close, {"max_diff": max_diff}

    def get_extra_params(self, test_case: Dict[str, Any]) -> List[Any]:
        return [test_case["n"]]

    def get_flops(self, test_case: Dict[str, Any]) -> int:
        return int(test_case["n"] * 3)
`;

const HARD_TANH = String.raw`
import torch
from typing import List, Dict, Tuple, Any

from problem import Problem

class hard_tanh(Problem):
    """KernelBench Level 1 HardTanh activation with fixed min=-1, max=1."""

    is_exact = False

    parameters = [
        {"name": "input", "type": "float", "pointer": True, "const": True},
        {"name": "output", "type": "float", "pointer": True, "const": False},
        {"name": "n", "type": "size_t", "pointer": False, "const": False},
    ]

    def __init__(self):
        super().__init__(name="hard-tanh")

    def reference_solution(self, input_tensor: torch.Tensor) -> torch.Tensor:
        return torch.clamp(input_tensor, min=-1.0, max=1.0)

    def _case(self, name: str, rows: int, cols: int) -> Dict[str, Any]:
        n = rows * cols
        seed = Problem.get_seed(f"{self.name}_{name}_{rows}_{cols}")
        dtype = self.param_dtype(0)
        return {
            "name": name,
            "n": n,
            "create_inputs": lambda rows=rows, cols=cols, seed=seed, dtype=dtype: (
                *(lambda g: (
                    torch.randn((rows, cols), device="cuda", dtype=dtype, generator=g) * 3.0,
                ))(torch.Generator(device="cuda").manual_seed(seed)),
            ),
        }

    def generate_test_cases(self) -> List[Dict[str, Any]]:
        return [
            self._case("4096x4096", 4096, 4096),
            self._case("6144x4096", 6144, 4096),
            self._case("4096x7168", 4096, 7168),
            self._case("4096x8192", 4096, 8192),
            self._case("8192x8192", 8192, 8192),
        ]

    def generate_sample(self) -> Dict[str, Any]:
        return self._case("sample_4x8", 4, 8)

    def verify_result(self, expected_output: torch.Tensor, actual_output: torch.Tensor) -> Tuple[bool, Dict[str, Any]]:
        is_close = torch.allclose(expected_output, actual_output, rtol=1e-6, atol=1e-6)
        max_diff = torch.max(torch.abs(expected_output - actual_output)).item()
        return is_close, {"max_diff": max_diff}

    def get_extra_params(self, test_case: Dict[str, Any]) -> List[Any]:
        return [test_case["n"]]

    def get_flops(self, test_case: Dict[str, Any]) -> int:
        return int(test_case["n"] * 2)
`;

const INSTANCE_NORM = String.raw`
import torch
import torch.nn.functional as F
from typing import List, Dict, Tuple, Any

from problem import Problem

class instance_norm_2d(Problem):
    """KernelBench Level 1 InstanceNorm over NCHW tensors."""

    is_exact = False
    epsilon = 1e-5

    parameters = [
        {"name": "input", "type": "float", "pointer": True, "const": True},
        {"name": "output", "type": "float", "pointer": True, "const": False},
        {"name": "N", "type": "size_t", "pointer": False, "const": False},
        {"name": "C", "type": "size_t", "pointer": False, "const": False},
        {"name": "H", "type": "size_t", "pointer": False, "const": False},
        {"name": "W", "type": "size_t", "pointer": False, "const": False},
        {"name": "epsilon", "type": "float", "pointer": False, "const": False},
    ]

    def __init__(self):
        super().__init__(name="instance-norm-2d")

    def reference_solution(self, input_tensor: torch.Tensor) -> torch.Tensor:
        return F.instance_norm(input_tensor, running_mean=None, running_var=None, weight=None, bias=None, use_input_stats=True, eps=self.epsilon)

    def _case(self, N: int, C: int, H: int, W: int) -> Dict[str, Any]:
        name = f"N={N}, C={C}, H={H}, W={W}"
        seed = Problem.get_seed(f"{self.name}_{name}")
        dtype = self.param_dtype(0)
        return {
            "name": name,
            "N": N,
            "C": C,
            "H": H,
            "W": W,
            "epsilon": self.epsilon,
            "create_inputs": lambda N=N, C=C, H=H, W=W, seed=seed, dtype=dtype: (
                *(lambda g: (
                    torch.randn((N, C, H, W), device="cuda", dtype=dtype, generator=g),
                ))(torch.Generator(device="cuda").manual_seed(seed)),
            ),
        }

    def generate_test_cases(self) -> List[Dict[str, Any]]:
        return [
            self._case(16, 64, 64, 64),
            self._case(8, 128, 64, 64),
            self._case(16, 128, 32, 64),
            self._case(32, 32, 128, 64),
            self._case(4, 256, 64, 64),
        ]

    def generate_sample(self) -> Dict[str, Any]:
        return self._case(2, 3, 4, 5)

    def verify_result(self, expected_output: torch.Tensor, actual_output: torch.Tensor) -> Tuple[bool, Dict[str, Any]]:
        is_close = torch.allclose(expected_output, actual_output, rtol=1e-4, atol=1e-4)
        max_diff = torch.max(torch.abs(expected_output - actual_output)).item()
        return is_close, {"max_diff": max_diff}

    def get_extra_params(self, test_case: Dict[str, Any]) -> List[Any]:
        return [test_case["N"], test_case["C"], test_case["H"], test_case["W"], test_case["epsilon"]]

    def get_flops(self, test_case: Dict[str, Any]) -> int:
        return int(test_case["N"] * test_case["C"] * test_case["H"] * test_case["W"] * 5)
`;

const GROUP_NORM = String.raw`
import torch
import torch.nn.functional as F
from typing import List, Dict, Tuple, Any

from problem import Problem

class group_norm_2d(Problem):
    """KernelBench Level 1 GroupNorm over NCHW tensors."""

    is_exact = False
    epsilon = 1e-5

    parameters = [
        {"name": "input", "type": "float", "pointer": True, "const": True},
        {"name": "output", "type": "float", "pointer": True, "const": False},
        {"name": "N", "type": "size_t", "pointer": False, "const": False},
        {"name": "C", "type": "size_t", "pointer": False, "const": False},
        {"name": "H", "type": "size_t", "pointer": False, "const": False},
        {"name": "W", "type": "size_t", "pointer": False, "const": False},
        {"name": "groups", "type": "int", "pointer": False, "const": False},
        {"name": "epsilon", "type": "float", "pointer": False, "const": False},
    ]

    def __init__(self):
        super().__init__(name="group-norm-2d")

    def reference_solution(self, input_tensor: torch.Tensor) -> torch.Tensor:
        return F.group_norm(input_tensor, num_groups=self.groups, weight=None, bias=None, eps=self.epsilon)

    def _case(self, N: int, C: int, H: int, W: int, groups: int) -> Dict[str, Any]:
        name = f"N={N}, C={C}, H={H}, W={W}, groups={groups}"
        seed = Problem.get_seed(f"{self.name}_{name}")
        dtype = self.param_dtype(0)
        return {
            "name": name,
            "N": N,
            "C": C,
            "H": H,
            "W": W,
            "groups": groups,
            "epsilon": self.epsilon,
            "create_inputs": lambda N=N, C=C, H=H, W=W, groups=groups, seed=seed, dtype=dtype: (
                setattr(self, "groups", groups) or
                (lambda g: (
                    torch.randn((N, C, H, W), device="cuda", dtype=dtype, generator=g),
                ))(torch.Generator(device="cuda").manual_seed(seed))
            ),
        }

    def generate_test_cases(self) -> List[Dict[str, Any]]:
        return [
            self._case(16, 64, 64, 64, 8),
            self._case(8, 128, 64, 64, 16),
            self._case(16, 96, 48, 64, 12),
            self._case(32, 32, 128, 64, 8),
            self._case(4, 256, 64, 64, 32),
        ]

    def generate_sample(self) -> Dict[str, Any]:
        return self._case(2, 8, 4, 5, 4)

    def verify_result(self, expected_output: torch.Tensor, actual_output: torch.Tensor) -> Tuple[bool, Dict[str, Any]]:
        is_close = torch.allclose(expected_output, actual_output, rtol=1e-4, atol=1e-4)
        max_diff = torch.max(torch.abs(expected_output - actual_output)).item()
        return is_close, {"max_diff": max_diff}

    def get_extra_params(self, test_case: Dict[str, Any]) -> List[Any]:
        return [test_case["N"], test_case["C"], test_case["H"], test_case["W"], test_case["groups"], test_case["epsilon"]]

    def get_flops(self, test_case: Dict[str, Any]) -> int:
        return int(test_case["N"] * test_case["C"] * test_case["H"] * test_case["W"] * 5)
`;

const CROSS_ENTROPY = String.raw`
import torch
import torch.nn.functional as F
from typing import List, Dict, Tuple, Any

from problem import Problem

class cross_entropy_loss(Problem):
    """KernelBench Level 1 CrossEntropyLoss over class logits."""

    is_exact = False

    parameters = [
        {"name": "logits", "type": "float", "pointer": True, "const": True},
        {"name": "labels", "type": "int", "pointer": True, "const": True},
        {"name": "output", "type": "float", "pointer": True, "const": False},
        {"name": "N", "type": "size_t", "pointer": False, "const": False},
        {"name": "C", "type": "size_t", "pointer": False, "const": False},
    ]

    def __init__(self):
        super().__init__(name="cross-entropy-loss")

    def reference_solution(self, logits: torch.Tensor, labels: torch.Tensor) -> torch.Tensor:
        return F.cross_entropy(logits, labels.long(), reduction="mean").reshape(())

    def _case(self, N: int, C: int) -> Dict[str, Any]:
        name = f"N={N}, C={C}"
        seed = Problem.get_seed(f"{self.name}_{name}")
        dtype = self.param_dtype(0)
        return {
            "name": name,
            "N": N,
            "C": C,
            "create_inputs": lambda N=N, C=C, seed=seed, dtype=dtype: (
                *(lambda g: (
                    torch.randn((N, C), device="cuda", dtype=dtype, generator=g),
                    torch.randint(0, C, (N,), device="cuda", dtype=torch.int32, generator=g),
                ))(torch.Generator(device="cuda").manual_seed(seed)),
            ),
        }

    def generate_test_cases(self) -> List[Dict[str, Any]]:
        return [
            self._case(8192, 256),
            self._case(16384, 512),
            self._case(32768, 256),
            self._case(8192, 1024),
            self._case(4096, 2048),
        ]

    def generate_sample(self) -> Dict[str, Any]:
        return self._case(4, 5)

    def verify_result(self, expected_output: torch.Tensor, actual_output: torch.Tensor) -> Tuple[bool, Dict[str, Any]]:
        is_close = torch.allclose(expected_output, actual_output, rtol=1e-4, atol=1e-4)
        abs_diff = torch.abs(expected_output - actual_output).item()
        return is_close, {"abs_diff": abs_diff}

    def get_extra_params(self, test_case: Dict[str, Any]) -> List[Any]:
        return [test_case["N"], test_case["C"]]

    def get_flops(self, test_case: Dict[str, Any]) -> int:
        return int(test_case["N"] * test_case["C"] * 4)
`;

const MASKED_CUMSUM = String.raw`
import torch
from typing import List, Dict, Tuple, Any

from problem import Problem

class masked_cumsum(Problem):
    """KernelBench Level 1 masked cumulative sum over a flat vector."""

    is_exact = False

    parameters = [
        {"name": "input", "type": "float", "pointer": True, "const": True},
        {"name": "mask", "type": "uint8_t", "pointer": True, "const": True},
        {"name": "output", "type": "float", "pointer": True, "const": False},
        {"name": "n", "type": "size_t", "pointer": False, "const": False},
    ]

    def __init__(self):
        super().__init__(name="masked-cumsum")

    def reference_solution(self, input_tensor: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        masked = torch.where(mask.bool(), input_tensor, torch.zeros_like(input_tensor))
        return torch.cumsum(masked, dim=0)

    def _case(self, n: int, density: float) -> Dict[str, Any]:
        name = f"N={n}, density={density:.2f}"
        seed = Problem.get_seed(f"{self.name}_{name}")
        dtype = self.param_dtype(0)
        return {
            "name": name,
            "n": n,
            "density": density,
            "create_inputs": lambda n=n, density=density, seed=seed, dtype=dtype: (
                *(lambda g: (
                    torch.randn(n, device="cuda", dtype=dtype, generator=g),
                    (torch.rand(n, device="cuda", generator=g) < density).to(torch.uint8),
                ))(torch.Generator(device="cuda").manual_seed(seed)),
            ),
        }

    def generate_test_cases(self) -> List[Dict[str, Any]]:
        return [
            self._case(1_048_576, 0.25),
            self._case(2_097_152, 0.50),
            self._case(4_194_304, 0.75),
            self._case(8_388_608, 0.40),
            self._case(16_777_216, 0.60),
        ]

    def generate_sample(self) -> Dict[str, Any]:
        return self._case(16, 0.50)

    def verify_result(self, expected_output: torch.Tensor, actual_output: torch.Tensor) -> Tuple[bool, Dict[str, Any]]:
        is_close = torch.allclose(expected_output, actual_output, rtol=1e-4, atol=1e-3)
        max_diff = torch.max(torch.abs(expected_output - actual_output)).item()
        return is_close, {"max_diff": max_diff}

    def get_extra_params(self, test_case: Dict[str, Any]) -> List[Any]:
        return [test_case["n"]]

    def get_flops(self, test_case: Dict[str, Any]) -> int:
        return int(test_case["n"])
`;

const PROBLEMS: KernelBenchProblem[] = [
  {
    slug: "softsign",
    title: "Softsign",
    description: SOFTSIGN_DESCRIPTION,
    difficulty: Difficulty.EASY,
    definition: SOFTSIGN,
  },
  {
    slug: "hard-tanh",
    title: "HardTanh",
    description: HARD_TANH_DESCRIPTION,
    difficulty: Difficulty.EASY,
    definition: HARD_TANH,
  },
  {
    slug: "instance-norm-2d",
    title: "2D Instance Normalization",
    description: INSTANCE_NORM_DESCRIPTION,
    difficulty: Difficulty.MEDIUM,
    definition: INSTANCE_NORM,
  },
  {
    slug: "group-norm-2d",
    title: "2D Group Normalization",
    description: GROUP_NORM_DESCRIPTION,
    difficulty: Difficulty.MEDIUM,
    definition: GROUP_NORM,
  },
  {
    slug: "cross-entropy-loss",
    title: "Cross Entropy Loss",
    description: CROSS_ENTROPY_DESCRIPTION,
    difficulty: Difficulty.MEDIUM,
    definition: CROSS_ENTROPY,
  },
  {
    slug: "masked-cumsum",
    title: "Masked Cumulative Sum",
    description: MASKED_CUMSUM_DESCRIPTION,
    difficulty: Difficulty.HARD,
    definition: MASKED_CUMSUM,
  },
];

async function main() {
  for (const problem of PROBLEMS) {
    await prisma.problem.upsert({
      where: { slug: problem.slug },
      update: {
        title: problem.title,
        description: problem.description,
        difficulty: problem.difficulty,
        author: "KernelBench",
        tags: ["kernelbench"],
        definition: problem.definition,
      },
      create: {
        slug: problem.slug,
        title: problem.title,
        description: problem.description,
        difficulty: problem.difficulty,
        author: "KernelBench",
        tags: ["kernelbench"],
        definition: problem.definition,
      },
    });

    console.log(`Upserted ${problem.slug}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
