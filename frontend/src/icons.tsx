// Dependency-free inline SVG icons. Every icon is decorative by default:
// accessible names come from the surrounding labels/aria-labels.
import type { ReactNode } from "react";

interface IconProps {
  className?: string;
  size?: number;
}

function Icon({ className, size = 18, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function LibraryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return <Icon {...props}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" /></Icon>;
}

export function CloseIcon(props: IconProps) {
  return <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>;
}

export function DownloadIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></Icon>;
}

export function QuoteIcon(props: IconProps) {
  return <Icon {...props}><path d="M5 7h5v7H5zm9 0h5v7h-5zM10 14c0 3-2 4-4 4m13-4c0 3-2 4-4 4" /></Icon>;
}

export function PendingIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 19V6" />
      <path d="m6.5 11 5.5-5.5L17.5 11" />
      <path d="M5 19h14" />
    </Icon>
  );
}

export function RecycleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 8.5h12" />
      <path d="M18 8.5 15.5 5H8L5.5 8.5" />
      <path d="M7 8.5 4 16l3 4.5h9.5L19.5 16l-3-7.5" />
    </Icon>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9v8A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z" />
    </Icon>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1" />
      <path d="M14 3.5V8h4" />
    </Icon>
  );
}

export function PdfIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1" />
      <path d="M14 3.5V8h4" />
      <path d="M8.5 13.5h2a1.5 1.5 0 0 1 0 3h-2zm0 3v-5" />
    </Icon>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 17.5 4.5-4.5 3.5 3.5 3-3 4 4" />
    </Icon>
  );
}

export function TextIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1" />
      <path d="M14 3.5V8h4" />
      <path d="M8 12.5h8M8 15.5h8M8 18h5" />
    </Icon>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.15" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </Icon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 15V5" />
      <path d="m7 9.5 5-4.5 5 4.5" />
      <path d="M4.5 19.5h15" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="m12 3.8 2.47 5.01 5.53.8-4 3.9.94 5.5L12 16.5l-4.94 2.6.94-5.51-4-3.9 5.53-.8z"
        fill={props.className?.includes("is-active") ? "currentColor" : "none"}
      />
    </Icon>
  );
}
