/**
 * Turn common LaTeX fragments into plain text (e.g. \frac{9}{7} → 9/7).
 * Runs only in the browser bundle — no API calls, no tokens, no KaTeX weight.
 */
export function latexishToPlainMath(input: string): string {
  let s = String(input ?? "").trim();

  s = s.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
  s = s.replace(/(?<!\$)\$([^$\n]+)\$(?!\$)/g, "$1");
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, "$1");
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, "$1");

  s = s.replace(/\\text\{([^{}]*)\}/g, "$1");
  s = s.replace(/\\mathrm\{([^{}]*)\}/g, "$1");
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
  s = s.replace(/\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g, "$1√($2)");

  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s
      .replace(/\\dfrac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
      .replace(/\\tfrac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2");
  }

  s = s.replace(/\\,/g, " ");
  s = s.replace(/\\cdot/g, "·");
  s = s.replace(/\\times/g, "×");
  s = s.replace(/\\pm/g, "±");
  s = s.replace(/\\circ/g, "°");
  s = s.replace(/\^\{([^}]*)\}/g, "^$1");
  s = s.replace(/\_\{([^}]*)\}/g, "_$1");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}
