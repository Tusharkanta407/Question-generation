import "dotenv/config";
import { queryQuestionsByPrompt } from "../../../src/server/rag/promptQuestionService";

async function main() {
  const prompt = process.argv.slice(2).join(" ").trim();
  if (!prompt) {
    console.log('Usage: npm run test:prompt-query -- "give 20 pulley problems from physics"');
    process.exit(1);
  }

  const result = await queryQuestionsByPrompt(prompt);
  console.log(`Prompt: ${result.prompt}`);
  console.log(`Filters: ${JSON.stringify(result.filters)}`);
  console.log(`Total: ${result.total}`);
  console.log("");

  result.questions.forEach((q) => {
    console.log(`${q.index}. [source=${q.source}] ${q.question}`);
    if (q.options) {
      for (const [key, value] of Object.entries(q.options)) {
        console.log(`   ${key}) ${value}`);
      }
    }
    console.log(`   link: ${q.link ?? "n/a"}`);
    console.log("");
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
