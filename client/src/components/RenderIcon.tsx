import type {IconType} from "react-icons";

/**
 * Something is wrong between react-icons and React 18.x.
 * React icons return ReactNode, while React requires ReactElement.
 */
export default function RenderIcon(
    {
        iconType,
        className
    }: {
        iconType: IconType,
        className: string
    }
) {
    const Component = iconType as unknown as React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
    return <Component className={className} aria-hidden={true}/>;
}
