// Pipe sink for interleaved stereo IEEE Float32. No format conversion or fallback in this process.
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <wrl/client.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

using Microsoft::WRL::ComPtr;
namespace {
constexpr GUID FloatSubtype = {0x00000003, 0x0000, 0x0010, {0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71}};
constexpr DWORD FrameBytes = 2 * sizeof(float);
void say(const char* value) { std::puts(value); std::fflush(stdout); }
struct Event {
    HANDLE value = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    ~Event() { if (value) CloseHandle(value); }
};

int play(DWORD rate) {
    const HANDLE pipe = GetStdHandle(STD_INPUT_HANDLE);
    if (!pipe || pipe == INVALID_HANDLE_VALUE || GetFileType(pipe) != FILE_TYPE_PIPE) { say("failed"); return 1; }
    ComPtr<IMMDeviceEnumerator> enumerator;
    ComPtr<IMMDevice> device;
    ComPtr<IAudioClient> client;
    const auto activate = [&]() {
        return device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(client.ReleaseAndGetAddressOf()));
    };
    if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&enumerator))) ||
        FAILED(enumerator->GetDefaultAudioEndpoint(eRender, eMultimedia, &device)) || FAILED(activate())) {
        say("unsupported"); return 2;
    }

    WAVEFORMATEXTENSIBLE wave{};
    wave.Format = {WAVE_FORMAT_EXTENSIBLE, 2, rate, rate * FrameBytes, FrameBytes, 32, 22};
    wave.Samples.wValidBitsPerSample = 32;
    wave.dwChannelMask = 3; // front left + front right
    wave.SubFormat = FloatSubtype;
    if (client->IsFormatSupported(AUDCLNT_SHAREMODE_EXCLUSIVE, &wave.Format, nullptr) != S_OK) {
        wave.Format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
        wave.Format.cbSize = 0;
        if (client->IsFormatSupported(AUDCLNT_SHAREMODE_EXCLUSIVE, &wave.Format, nullptr) != S_OK) {
            say("unsupported"); return 2;
        }
    }

    REFERENCE_TIME devicePeriod = 0;
    if (FAILED(client->GetDevicePeriod(&devicePeriod, nullptr))) { say("unsupported"); return 2; }
    REFERENCE_TIME period = std::max<REFERENCE_TIME>(devicePeriod, 200000); // 20 ms or the driver's period
    const auto initialize = [&]() {
        return client->Initialize(AUDCLNT_SHAREMODE_EXCLUSIVE, AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
            period, period, &wave.Format, nullptr);
    };
    HRESULT result = initialize();
    UINT32 frames = 0;
    if (result == AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED && SUCCEEDED(client->GetBufferSize(&frames)) && frames && SUCCEEDED(activate())) {
        period = (10000000LL * frames + rate / 2) / rate;
        result = initialize();
    }
    Event available;
    ComPtr<IAudioRenderClient> render;
    if (FAILED(result) || !available.value || FAILED(client->GetBufferSize(&frames)) || !frames || frames > rate / 2 ||
        FAILED(client->SetEventHandle(available.value)) || FAILED(client->GetService(IID_PPV_ARGS(&render)))) {
        say("unsupported"); return 2;
    }
    BYTE* data = nullptr;
    if (FAILED(render->GetBuffer(frames, &data)) || FAILED(render->ReleaseBuffer(frames, AUDCLNT_BUFFERFLAGS_SILENT)) || FAILED(client->Start())) {
        say("unsupported"); return 2;
    }
    say("ready");
    const DWORD capacity = frames * FrameBytes;
    // Exclusive, event-driven playback requires the complete buffer on each wake-up.
    // The parent bounds the pipe backlog, and a stalled or closed parent cannot keep the device open indefinitely.
    unsigned empty = 0;
    for (;;) {
        if (WaitForSingleObject(available.value, 2000) != WAIT_OBJECT_0) break;
        DWORD waiting = 0;
        if (!PeekNamedPipe(pipe, nullptr, 0, nullptr, &waiting, nullptr)) break;
        const DWORD bytes = std::min(capacity, waiting - waiting % FrameBytes);
        if (bytes < FrameBytes) {
            if (++empty >= 200) break;
            if (FAILED(render->GetBuffer(frames, &data)) || FAILED(render->ReleaseBuffer(frames, AUDCLNT_BUFFERFLAGS_SILENT))) break;
            continue;
        }
        empty = 0;
        if (FAILED(render->GetBuffer(frames, &data))) break;
        DWORD read = 0;
        if (!ReadFile(pipe, data, bytes, &read, nullptr) || read % FrameBytes) {
            render->ReleaseBuffer(frames, AUDCLNT_BUFFERFLAGS_SILENT);
            break;
        }
        for (DWORD i = 0; i < read / sizeof(float); ++i) {
            auto& sample = reinterpret_cast<float*>(data)[i];
            sample = std::isfinite(sample) ? std::clamp(sample, -1.0f, 1.0f) : 0.0f;
        }
        std::memset(data + read, 0, capacity - read);
        if (FAILED(render->ReleaseBuffer(frames, 0))) break;
    }
    client->Stop();
    return 0;
}
}

int main(int argc, char** argv) {
    char* end = nullptr;
    const unsigned long rate = argc == 2 ? std::strtoul(argv[1], &end, 10) : 0;
    if (!end || *end || rate < 8000 || rate > 192000) { say("failed"); return 1; }
    const auto init = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(init)) { say("failed"); return 1; }
    const int code = play(rate);
    CoUninitialize();
    return code;
}
