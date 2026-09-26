import { Link } from 'react-router'
import type { ComponentPropsWithoutRef } from 'react'

// MDS navigation components render an anchor and hand it `href`. react-router
// wants `to`. Passing this as their `as` prop translates the one prop, which
// keeps client-side navigation without the app reimplementing modifier-click,
// middle-click or the scroll behaviour Link already handles.
export function RouterAnchor({ href, ...rest }: { href?: string } & Omit<ComponentPropsWithoutRef<'a'>, 'href'>) {
  return <Link to={href ?? ''} {...rest} />
}
