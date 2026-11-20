/**
 * See what the AI server reads from a CDC teaching module PDF, without
 * uploading it:
 *
 *   npm run read-module -- "C:\path\to\Computer_Science_Module_Form2.pdf"
 *
 * Prints every topic (with its term), sub-topic, specific competence,
 * learning activity and rubric found, then the reader's warnings. Nothing is
 * saved. Upload the PDF in the superAdmin console (type "Teacher's guide /
 * teaching module") to use it.
 */
import fs from "node:fs/promises";
import { parseModule } from "../src/services/curriculum/ModuleParser.js";
import { PDFProcessor } from "../src/services/rag/PDFProcessor.js";

const file = process.argv[2];
if (!file) {
  console.log('Usage: npm run read-module -- "path\\to\\module.pdf"');
  process.exit(1);
}
const module = parseModule(await new PDFProcessor().extractItems(await fs.readFile(file)));
console.log(`${module.title || "(no title found)"}  Form ${module.form ?? "?"}  ${module.year ?? ""}\n`);
for (const t of module.topics) {
  console.log(`TOPIC ${t.code} ${t.name}${t.term ? `  (Term ${t.term})` : ""}  pages ${t.pages.join("-")}`);
  console.log(`  general competences: ${t.generalCompetences.map((c) => c.name).join(", ")}`);
  console.log(`  key terms: ${t.keyTerms.map((k) => k.term).join(", ")}`);
  for (const s of t.subTopics) {
    console.log(`  SUB-TOPIC ${s.code} ${s.name}`);
    for (const c of s.competences) console.log(`    competence ${c.code} ${c.text}`);
    console.log(`    expected standard: ${s.expectedStandards.join("; ")}`);
    for (const a of s.activities)
      console.log(`    activity ${a.number}: ${a.title}  (p. ${a.page}; ${a.materials.length} materials, ${a.methods.length} methods${a.howToConduct ? ", how to conduct" : ""}${a.contentTip ? ", content tip" : ""})`);
    console.log(`    formative: ${s.formative?.tasks.length ?? 0} tasks, rubric ${s.formative?.rubric.map((r) => r.criterion).join(" | ") || "none"}`);
    console.log(`    summative: ${s.summative?.tasks.length ?? 0} tasks, rubric ${s.summative?.rubric.map((r) => r.criterion).join(" | ") || "none"}`);
  }
  console.log("");
}
console.log(module.warnings.length ? `Warnings:\n- ${module.warnings.join("\n- ")}` : "No warnings.");
