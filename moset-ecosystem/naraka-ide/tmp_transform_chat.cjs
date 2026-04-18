const fs = require('fs');
const filepath = 's:/Naraka Studio/Moset/moset-ecosystem/naraka-ide/src/ChatPanel.tsx';
let content = fs.readFileSync(filepath, 'utf8');

// 1. Remove Config Panel block
const configPanelRegex = /\{\/\* ─── Config Panel ────────────────────────────────────────────────── \*\/\}\s*\{showConfig && \([\s\S]+?\}\)/;
content = content.replace(configPanelRegex, '');

// 2. Change the button to dispatch setting event instead of triggering local UI
content = content.replace(
  /onClick=\{\(\) => \{ setShowConfig\(!showConfig\); setShowHistory\(false\); \}\}/,
  `onClick={() => window.dispatchEvent(new Event("open-settings"))}`
);

// 3. Remove `showConfig` state
content = content.replace(/const \[showConfig, setShowConfig\] = useState\(false\);\n/, '');

// 4. Update the settings listening code
const settingsListener = `
  useEffect(() => {
    const handleSettingsUpdated = () => {
      setMaxTokens(parseInt(localStorage.getItem("moset_max_tokens") || "2048", 10));
      setContextTokens(parseInt(localStorage.getItem("moset_context_tokens") || "4096", 10));
      setActiveProvider(localStorage.getItem("moset_ai_provider") || "soberano");
      setCloudApi(localStorage.getItem("moset_cloud_provider") || "openai");
      setOpenAiKey(localStorage.getItem("moset_openai_api_key") || "");
      setAnthropicKey(localStorage.getItem("moset_anthropic_api_key") || "");
      setGoogleKey(localStorage.getItem("moset_google_api_key") || "");
      setMistralKey(localStorage.getItem("moset_mistral_api_key") || "");
      setGroqKey(localStorage.getItem("moset_groq_api_key") || "");
      setOpenrouterKey(localStorage.getItem("moset_openrouter_api_key") || "");
      setCustomModelId(localStorage.getItem("moset_custom_model_id") || "");
      setModelPath(localStorage.getItem("moset_model_path") || "");
      setTokenizerPath(localStorage.getItem("moset_tokenizer_path") || "");
    };

    window.addEventListener("settings-updated", handleSettingsUpdated);
    return () => window.removeEventListener("settings-updated", handleSettingsUpdated);
  }, []);
`;

// Insert after the existing initial useEffect for localStorage
const localStoragesEffectRegex = /useEffect\(\(\) => \{ localStorage\.setItem\("moset_openrouter_api_key", openrouterKey\); \}, \[openrouterKey\]\);/;
content = content.replace(localStoragesEffectRegex, `$&` + settingsListener);

// We need to keep the variables because they are used to make the API requests! We just sync them.
fs.writeFileSync(filepath, content);
console.log('ChatPanel transformed!');
