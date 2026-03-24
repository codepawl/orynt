/**
 * Reusable animation utilities for consistent hover effects across components
 */

/**
 * Hover brightness animation utility
 * Provides smooth color transition from normal to bright on hover
 * Supports both light and dark mode
 * 
 * @returns Object with base and hover classes for Tailwind CSS
 */
export const hoverBrightness = {
  base: "transition-colors duration-200",
  hover: "hover:text-neutral-950 dark:hover:text-neutral-50",
  /**
   * Get all classes combined
   */
  get classes() {
    return `${this.base} ${this.hover}`;
  },
};

/**
 * Reusable animated underline utility
 * Provides smooth underline animation on hover
 * Can be applied to any element via className
 * 
 * Usage: className="underline-animated"
 * Or use the CSS class directly: className="link-animated"
 */
export const underlineAnimated = {
  /**
   * CSS class name to apply for animated underline
   */
  className: "underline-animated",
  /**
   * Alternative class name (backward compatible)
   */
  linkClassName: "link-animated",
};

/**
 * Hover brightness animation with custom duration
 * 
 * @param duration - Transition duration in milliseconds (default: 200)
 * @returns Object with base and hover classes
 */
export function createHoverBrightness(duration: number = 200) {
  return {
    base: `transition-colors duration-${duration}`,
    hover: "hover:text-neutral-950 dark:hover:text-neutral-50",
    get classes() {
      return `${this.base} ${this.hover}`;
    },
  };
}

/**
 * Hover brightness animation with custom colors
 * 
 * @param normalColor - Normal state color classes
 * @param brightColor - Hover state color classes
 * @param duration - Transition duration in milliseconds (default: 200)
 * @returns Object with base and hover classes
 */
export function createCustomHoverBrightness(
  normalColor: string,
  brightColor: string,
  duration: number = 200
) {
  return {
    base: `transition-colors duration-${duration} ${normalColor}`,
    hover: brightColor,
    get classes() {
      return `${this.base} ${this.hover}`;
    },
  };
}
