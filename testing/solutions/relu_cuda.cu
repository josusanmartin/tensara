extern "C" __global__ void relu_kernel(
    const float* input,
    float* output,
    unsigned long long total
) {
    unsigned long long idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < total) {
        float value = input[idx];
        output[idx] = value > 0.0f ? value : 0.0f;
    }
}

extern "C" void solution(
    const float* input,
    float* output,
    unsigned long long n,
    unsigned long long m
) {
    unsigned long long total = n * m;
    int threads = 256;
    unsigned long long blocks = (total + threads - 1) / threads;
    relu_kernel<<<blocks, threads>>>(input, output, total);
}
