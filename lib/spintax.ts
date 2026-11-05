/**
 * Spintax & Dynamic Message Variation Engine
 *
 * Enforces Meta Section 6.1 Account Safety Guidelines:
 * Sending identical responses in high volume triggers Meta spam filters (Error 368).
 * This engine dynamically expands Spintax templates (e.g. `{Hey|Hi|Hello}`) and resolves
 * personalization variables (`{username}`, `@{username}`, `{name}`) across public comment
 * replies and direct messages.
 */

export const DEFAULT_PUBLIC_REPLY_TEMPLATES: string[] = [
  "{Hey|Hi|Hello} @{username}! {Just sent you|Sent you|Delivered} the {link|details|guide} in your DM! 🚀",
  "Check your {inbox|DMs} @{username}! 📬 Sent you the {link|info}.",
  "{Sent!|Delivered!} ✨ Check your {DM|inbox} @{username}!",
  "Just {sent you a DM|dropped a message in your inbox} @{username}! 📩 Let me know if you got it.",
  "Check your {direct messages|inbox} @{username}! 📥 Everything is waiting for you.",
  "{Hey|Hello} @{username}, {just messaged you|sent you the details} in your DM! 💫",
  "All {sent|done}! 📬 Check your {inbox|message requests} @{username}.",
  "{Sent over to your DMs|Delivered to your inbox} @{username}! 🔥 Hope it helps.",
  "Check your inbox @{username} 📩 Sent you the {link|resource}!",
  "{Hey|Hi} @{username}! {Just delivered|Sent over} the link to your DM! ✨",
  "Sent! 📬 Check your {DMs|requests} @{username} and enjoy!",
  "{Message sent!|Delivered!} 📥 Check your {inbox|direct messages} @{username}.",
  "Check your {messages|inbox} @{username}! 🚀 Sent the {info|link} over.",
  "{Hey|Hi} @{username}, {I've sent|just sent} the {link|details} to your direct messages! 📬",
  "Sent to your {DM|inbox} @{username}! ✨ Reach out if you need anything else.",
  "{All set!|Done!} 📩 Check your {DMs|inbox} @{username} for the {link|details}.",
  "Just {dropped into your DMs|popped into your inbox} @{username}! 📬 Enjoy!",
  "{Delivered!|Sent!} 💫 Check your {inbox|message requests} @{username}.",
  "{Hey there|Hi} @{username}! {Sent you the info|Check your DM} 📥",
  "Check your {requests or inbox|inbox} @{username}! 📩 Just delivered.",
]

/**
 * Parses spintax blocks formatted as `{option1|option2|option3}`.
 * Supports nested spintax structures up to 10 levels deep.
 */
export function parseSpintax(template: string): string {
  if (!template || typeof template !== "string") return ""
  let result = template
  const spintaxRegex = /\{([^{}]+?\|[^{}]+?)\}/
  let iterations = 0
  const MAX_ITERATIONS = 20

  while (spintaxRegex.test(result) && iterations < MAX_ITERATIONS) {
    result = result.replace(spintaxRegex, (_, options) => {
      const choices = options.split("|")
      return choices[Math.floor(Math.random() * choices.length)]
    })
    iterations++
  }

  return result
}

/**
 * Replaces dynamic variables such as `{username}`, `@{username}`, and `{name}`.
 */
export function resolveTemplateVariables(
  template: string,
  variables: { username?: string; name?: string; [key: string]: any } = {},
): string {
  if (!template || typeof template !== "string") return ""
  let text = template
  const rawUsername = variables.username ? String(variables.username).trim() : ""
  const cleanUsername = rawUsername.replace(/^@+/, "")

  // Replace @{username}
  text = text.replace(/@\{username\}/gi, cleanUsername ? `@${cleanUsername}` : "")

  // Replace {username}
  text = text.replace(/\{username\}/gi, cleanUsername ? cleanUsername : "")

  // Replace {name}
  const name = variables.name ? String(variables.name).trim() : (cleanUsername || "there")
  text = text.replace(/\{name\}/gi, name)

  // Clean up any double spaces caused by empty username substitutions
  text = text.replace(/[ ]{2,}/g, " ").trim()

  return text
}

/**
 * Full expansion: parses spintax notation and replaces variables.
 */
export function expandTemplate(
  template: string,
  variables: { username?: string; name?: string; [key: string]: any } = {},
): string {
  if (!template || typeof template !== "string") return ""
  const spintaxExpanded = parseSpintax(template)
  return resolveTemplateVariables(spintaxExpanded, variables)
}

/**
 * Selects and expands a randomized, spintax-powered public reply for a comment.
 * If userPool is provided and non-empty, picks from user templates; otherwise rotates through default templates.
 * Enforces tag attachment and Meta's 2,200 character comment limit.
 */
export function getSpintaxPublicReply(username?: string, customPool?: string[]): string {
  const cleanUsername = username ? username.replace(/^@+/, "").trim() : ""

  const validUserPool = Array.isArray(customPool)
    ? customPool.filter((r) => typeof r === "string" && r.trim().length > 0 && r.trim().toLowerCase() !== "send to your dm")
    : []

  const pool = validUserPool.length > 0 ? validUserPool : DEFAULT_PUBLIC_REPLY_TEMPLATES
  const chosenTemplate = pool[Math.floor(Math.random() * pool.length)]

  let expanded = expandTemplate(chosenTemplate, { username: cleanUsername })

  // Ensure commenter is tagged so Instagram delivers an instant push notification
  if (cleanUsername && !expanded.includes(`@${cleanUsername}`)) {
    expanded = `@${cleanUsername} ${expanded}`
  }

  // Meta Character Limit for comments: 2,200 characters
  return expanded.slice(0, 2200)
}
