import type { Metadata } from "next";
import QuestionGeneratorClient from "@/src/components/question-gen/QuestionGeneratorClient";

export const metadata: Metadata = {
  title: "Question Studio | Teacher Portal",
  description: "Generate mixed question sets from natural language",
};

export default function QuestionGeneratorPage() {
  return <QuestionGeneratorClient />;
}
