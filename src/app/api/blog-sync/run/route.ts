import { NextResponse } from "next/server";

import { requireRouteAuth } from "@/lib/routeAuth";
import { getBlogKnowledgeSummary, syncRunFitCoachBlogPosts } from "@/lib/services/blogSyncService";

export async function POST(request: Request) {
  const auth = await requireRouteAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const result = await syncRunFitCoachBlogPosts({
      force: true,
      triggeredBy: "manual-blog-sync"
    });
    const blogKnowledge = await getBlogKnowledgeSummary();

    return NextResponse.json({
      ...result,
      blogKnowledge
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Blog sync failed."
      },
      { status: 500 }
    );
  }
}
