// Report the signer of a file only after Windows validates its Authenticode signature.
#include <windows.h>
#include <softpub.h>
#include <wincrypt.h>
#include <wintrust.h>
#include <cstdio>

int wmain(int argc, wchar_t* argv[]) {
    if (argc != 2) return 2;
    HANDLE handle = CreateFileW(argv[1], GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (handle == INVALID_HANDLE_VALUE) return 1;

    GUID policy = WINTRUST_ACTION_GENERIC_VERIFY_V2;
    WINTRUST_FILE_INFO file{};
    file.cbStruct = sizeof(file);
    file.pcwszFilePath = argv[1];
    file.hFile = handle;
    WINTRUST_DATA trust{};
    trust.cbStruct = sizeof(trust);
    trust.dwUIChoice = WTD_UI_NONE;
    trust.fdwRevocationChecks = WTD_REVOKE_WHOLECHAIN;
    trust.dwUnionChoice = WTD_CHOICE_FILE;
    trust.pFile = &file;
    trust.dwStateAction = WTD_STATEACTION_VERIFY;
    trust.dwProvFlags = WTD_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT | WTD_DISABLE_MD2_MD4 | WTD_MOTW;

    BYTE digest[32]{};
    DWORD length = sizeof(digest);
    bool verified = false;
    // The digest is of the leaf certificate from the same verified trust state,
    // not an arbitrary certificate contained in the executable.
    if (WinVerifyTrust(reinterpret_cast<HWND>(INVALID_HANDLE_VALUE), &policy, &trust) == ERROR_SUCCESS) {
        auto* provider = WTHelperProvDataFromStateData(trust.hWVTStateData);
        auto* signer = provider ? WTHelperGetProvSignerFromChain(provider, 0, FALSE, 0) : nullptr;
        auto* cert = signer && signer->dwError == ERROR_SUCCESS ? WTHelperGetProvCertFromChain(signer, 0) : nullptr;
        verified = cert && cert->pCert
            && CryptHashCertificate2(L"SHA256", 0, nullptr, cert->pCert->pbCertEncoded, cert->pCert->cbCertEncoded, digest, &length)
            && length == sizeof(digest);
    }
    trust.dwStateAction = WTD_STATEACTION_CLOSE;
    WinVerifyTrust(reinterpret_cast<HWND>(INVALID_HANDLE_VALUE), &policy, &trust);
    CloseHandle(handle);
    if (!verified) return 1;
    for (BYTE byte : digest) std::printf("%02x", static_cast<unsigned int>(byte));
    std::putchar('\n');
    return 0;
}
