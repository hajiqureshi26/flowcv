/** Shared viewport values for responsive regression checks (CSS uses matching cutoffs). */
export const RESPONSIVE_BREAKPOINTS = { phone: 480, narrowTablet: 640, tablet: 760, wideTablet: 900, desktop: 1050 } as const;
export const RESPONSIVE_VIEWPORTS = [320, 360, 375, 390, 414, 768, 1024, 1280, 1440].map((width) => ({ width, height: width < 600 ? 844 : 900 }));
