#include <cuda_runtime.h>

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <vector>

namespace {

void check(cudaError_t status, const char* operation) {
  if (status != cudaSuccess) {
    std::fprintf(stderr, "%s failed: %s\n", operation, cudaGetErrorString(status));
    std::exit(1);
  }
}

__global__ void affine(const float* input, float* output, int count) {
  const int index = blockIdx.x * blockDim.x + threadIdx.x;
  if (index < count) {
    output[index] = input[index] * 3.0F + 7.0F;
  }
}

}  // namespace

int main() {
  constexpr int count = 1 << 20;
  constexpr std::size_t bytes = static_cast<std::size_t>(count) * sizeof(float);

  int deviceCount = 0;
  check(cudaGetDeviceCount(&deviceCount), "cudaGetDeviceCount");
  if (deviceCount < 1) {
    std::fprintf(stderr, "no CUDA device found\n");
    return 1;
  }

  cudaDeviceProp properties{};
  check(cudaGetDeviceProperties(&properties, 0), "cudaGetDeviceProperties");
  if (properties.major != 8 || properties.minor != 9) {
    std::fprintf(stderr, "unexpected compute capability: %d.%d\n", properties.major, properties.minor);
    return 1;
  }

  std::vector<float> input(count);
  std::vector<float> output(count);
  for (int index = 0; index < count; ++index) {
    input[index] = static_cast<float>(index % 1024) / 8.0F;
  }

  float* deviceInput = nullptr;
  float* deviceOutput = nullptr;
  check(cudaMalloc(&deviceInput, bytes), "cudaMalloc(input)");
  check(cudaMalloc(&deviceOutput, bytes), "cudaMalloc(output)");
  check(cudaMemcpy(deviceInput, input.data(), bytes, cudaMemcpyHostToDevice), "cudaMemcpy(H2D)");

  constexpr int blockSize = 256;
  affine<<<(count + blockSize - 1) / blockSize, blockSize>>>(deviceInput, deviceOutput, count);
  check(cudaGetLastError(), "affine launch");
  check(cudaDeviceSynchronize(), "cudaDeviceSynchronize");
  check(cudaMemcpy(output.data(), deviceOutput, bytes, cudaMemcpyDeviceToHost), "cudaMemcpy(D2H)");

  for (int index = 0; index < count; ++index) {
    const float expected = input[index] * 3.0F + 7.0F;
    if (std::fabs(output[index] - expected) > 0.0001F) {
      std::fprintf(stderr, "result mismatch at %d\n", index);
      return 1;
    }
  }

  int runtimeVersion = 0;
  int driverVersion = 0;
  check(cudaRuntimeGetVersion(&runtimeVersion), "cudaRuntimeGetVersion");
  check(cudaDriverGetVersion(&driverVersion), "cudaDriverGetVersion");
  check(cudaFree(deviceOutput), "cudaFree(output)");
  check(cudaFree(deviceInput), "cudaFree(input)");

  std::printf("LOCAL_CUDA_EXECUTION=PASS\n");
  std::printf("CUDA_DEVICE=%s\n", properties.name);
  std::printf("CUDA_COMPUTE_CAPABILITY=%d.%d\n", properties.major, properties.minor);
  std::printf("CUDA_RUNTIME_VERSION=%d\n", runtimeVersion);
  std::printf("CUDA_DRIVER_API_VERSION=%d\n", driverVersion);
  std::printf("CUDA_KERNEL_ELEMENTS=%d\n", count);
  return 0;
}
