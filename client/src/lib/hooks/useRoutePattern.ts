import { useLocation, useParams } from "react-router-dom";
import { RoutePattern } from "../RoutePattern.ts";

/** Returns the pattern of the current route, e.g. /user/:username. */
export function useRoutePattern(): string {
  const { pathname } = useLocation();
  return RoutePattern.fromPath(pathname, useParams());
}
