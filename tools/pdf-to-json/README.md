# PDF to JSON Question Extractor

Converts PDF question papers to structured JSON.

## Usage

```bash
# From teacher-portal folder:
npx tsx tools/pdf-to-json/extract.ts "datasets/jee/JEE-Main-2023-30-January-Shift-1.pdf"
```

## Requirements

- `OPENROUTER_API_KEY` in `.env`
- Uses FREE model: `google/gemini-2.0-flash-exp:free`

## Output

Creates `{filename}_questions.json` in the same folder with structure:

```json
[
  {
    "question_number": 1,
    "question_text": "...",
    "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
    "correct_answer": "B",
    "question_type": "mcq",
    "subject": "Physics",
    "chapter": "Mechanics",
    "difficulty": "medium"
  }
]
```

## Notes

- Uses free Gemini model (no cost)
- Truncates very long PDFs to 25k chars
- For large PDFs, consider splitting manually
