import type { Metadata } from "next";
import config from "@payload-config";
import { RootPage, generatePageMetadata } from "@payloadcms/next/views";
import { importMap } from "../importMap";

type Params = {
  segments: string[];
};

type SearchParams = {
  [key: string]: string | string[];
};

type Args = {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
};

export function generateMetadata({ params, searchParams }: Args): Promise<Metadata> {
  return generatePageMetadata({
    config,
    params,
    searchParams
  });
}

export default function Page({ params, searchParams }: Args) {
  return RootPage({
    config,
    importMap,
    params,
    searchParams
  });
}
