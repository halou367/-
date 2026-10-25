(function (root) {
  'use strict';
  const registry = root.BranaV1Modules || (root.BranaV1Modules = Object.create(null));
  const prev = registry['habit-engine'] || Object.create(null);
  const pick = (fn, key, globalKey) => { let val; try { val = typeof fn === 'function' ? fn() : fn; } catch { val = undefined; } return typeof val !== 'undefined' ? val : (root[globalKey || key] || prev[key] || null); };
  registry['habit-engine'] = Object.freeze({
    sharedFingerprintSchema: pick(() => (typeof SharedFingerprintSchema !== 'undefined' ? SharedFingerprintSchema : undefined), 'sharedFingerprintSchema', 'SharedFingerprintSchema'),
    personalFingerprintMath: pick(() => (typeof PersonalFingerprintMath !== 'undefined' ? PersonalFingerprintMath : undefined), 'personalFingerprintMath', 'PersonalFingerprintMath'),
    probeOutputGuard: pick(() => (typeof ProbeOutputGuard !== 'undefined' ? ProbeOutputGuard : undefined), 'probeOutputGuard', 'ProbeOutputGuard'),
    probeArchive: pick(() => (typeof ProbeArchive !== 'undefined' ? ProbeArchive : undefined), 'probeArchive', 'ProbeArchive'),
    probeBankCache: pick(() => (typeof ProbeBankCache !== 'undefined' ? ProbeBankCache : undefined), 'probeBankCache', 'ProbeBankCache'),
    sharedFingerprint: pick(() => (typeof SharedFP !== 'undefined' ? SharedFP : undefined), 'sharedFingerprint', 'SharedFP'),
    revolver: pick(() => (typeof Revolver !== 'undefined' ? Revolver : undefined), 'revolver', 'Revolver'),
    fingerprintBatch: pick(() => (typeof FingerprintBatch !== 'undefined' ? FingerprintBatch : undefined), 'fingerprintBatch', 'FingerprintBatch'),
    probeVendor: pick(() => (typeof ProbeLib !== 'undefined' ? ProbeLib : undefined), 'probeVendor', 'ProbeLib'),
    probeBankIkale: pick(() => (typeof IkaleBank !== 'undefined' ? IkaleBank : undefined), 'probeBankIkale', 'IkaleBank'),
    fpLibs: pick(() => (typeof FPLibs !== 'undefined' ? FPLibs : undefined), 'fpLibs', 'FPLibs'),
    personalFingerprint: pick(() => (typeof PersonalFP !== 'undefined' ? PersonalFP : undefined), 'personalFingerprint', 'PersonalFP'),
    fingerprint: pick(() => (typeof Fingerprint !== 'undefined' ? Fingerprint : undefined), 'fingerprint', 'Fingerprint'),
    fingerprintLibraryUi: pick(() => (typeof FingerprintLibrary !== 'undefined' ? FingerprintLibrary : undefined), 'fingerprintLibraryUi', 'FingerprintLibrary'),
    pelicanTest: pick(() => (typeof PelicanTest !== 'undefined' ? PelicanTest : undefined), 'pelicanTest', 'PelicanTest'),
    fingerprintReview: pick(() => (typeof FingerprintReview !== 'undefined' ? FingerprintReview : undefined), 'fingerprintReview', 'FingerprintReview'),
    habitBuiltinBank: pick(() => (typeof BUILTIN_HABIT_BANK !== 'undefined' ? BUILTIN_HABIT_BANK : undefined), 'habitBuiltinBank', 'BUILTIN_HABIT_BANK'),
    chatHabitFingerprint: pick(() => (typeof ChatHabitFingerprint !== 'undefined' ? ChatHabitFingerprint : undefined), 'chatHabitFingerprint', 'ChatHabitFingerprint'),
    strength: pick(() => (typeof Strength !== 'undefined' ? Strength : undefined), 'strength', 'Strength'),
  });
})(typeof self !== 'undefined' ? self : globalThis);
