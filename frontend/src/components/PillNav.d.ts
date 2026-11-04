import type { CSSProperties, ElementType, MouseEvent, ReactNode } from 'react';

export interface PillNavItem {
  label: string;
  href?: string;
  icon?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  ariaHasPopup?: 'menu';
  expanded?: boolean;
  controls?: string;
}

export interface PillNavProps {
  items?: PillNavItem[];
  logo?: string | ReactNode;
  logoAlt?: string;
  logoHref?: string;
  activeHref?: string;
  defaultActiveIndex?: number;
  onItemClick?: (item: PillNavItem, index: number, event: MouseEvent<HTMLElement>) => void;
  linkComponent?: ElementType;
  theme?: 'dark' | 'light';
  layout?: 'split' | 'joined';
  itemStyle?: 'pill' | 'plain';
  hoverEffect?: 'fill' | 'glide' | 'none';
  indicator?: 'dot' | 'pill' | 'none';
  surface?: 'glass' | 'solid' | 'none';
  size?: 'sm' | 'md' | 'lg';
  highlightColor?: string;
  highlightTextColor?: string;
  barColor?: string;
  textColor?: string;
  bounce?: number;
  stretch?: number;
  collapse?: 'auto' | 'always' | 'never';
  onMenuToggle?: (open: boolean) => void;
  intro?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties & { [key: `--${string}`]: string | number };
}

export default function PillNav(props: PillNavProps): ReactNode;
