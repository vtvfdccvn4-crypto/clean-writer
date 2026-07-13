/**
 * Compatibility facade for preview CSS generation.
 * Domain implementations live under ./css and can be imported directly by
 * new callers while existing preview code keeps its stable import path.
 */
export { resolveMarginContent, generatePageCss } from './css/page-css';
export { generateTypographyCss } from './css/typography-css';
export { generateListCss } from './css/list-css';
export { generateTableCss } from './css/table-css';
