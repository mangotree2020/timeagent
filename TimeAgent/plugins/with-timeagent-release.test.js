const { addReleaseSigning } = require('./with-timeagent-release');

const generatedGradle = `
def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()

android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}
`;

describe('TimeAgent release config plugin', () => {
  it('removes the debug-key release fallback and remains idempotent', () => {
    const once = addReleaseSigning(generatedGradle);
    const twice = addReleaseSigning(once);

    expect(once).toContain('if (hasReleaseSigning) signingConfig signingConfigs.release');
    expect(once).toContain('TimeAgent release signing credentials are required');
    expect(once).toContain('debug {\n            signingConfig signingConfigs.debug');
    expect(once).not.toContain('release {\n            signingConfig signingConfigs.debug');
    expect(twice).toBe(once);
  });
});
