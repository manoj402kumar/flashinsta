// Type declarations for non-JS/TS assets
declare module "*.css" {
  const content: { [className: string]: string }
  export default content
}

declare module "*.svg" {
  const content: React.FC<React.SVGProps<SVGSVGElement>> | string
  export default content
}

declare module "*.png" {
  const content: string
  export default content
}

declare module "*.jpg" {
  const content: string
  export default content
}
