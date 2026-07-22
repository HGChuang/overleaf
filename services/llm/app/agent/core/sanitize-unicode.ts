/**
 * Vendored from @earendil-works/pi-ai (MIT License, Copyright (c) 2025 Mario Zechner)
 * — src/utils/sanitize-unicode.ts, unchanged.
 *
 * Removes unpaired Unicode surrogate characters from a string. Unpaired
 * surrogates cause JSON serialization errors in many API providers. Valid
 * emoji and other characters outside the BMP use properly paired surrogates
 * and are NOT affected.
 */
export function sanitizeSurrogates(text: string): string {
	// Replace unpaired high surrogates (0xD800-0xDBFF not followed by low surrogate)
	// Replace unpaired low surrogates (0xDC00-0xDFFF not preceded by high surrogate)
	return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}
