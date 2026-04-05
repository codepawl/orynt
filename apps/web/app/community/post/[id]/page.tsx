import { notFound } from "next/navigation";
import { fetchPost, fetchComments } from "app/lib/community";
import { PostDetail } from "./PostDetail";
import { CommentSection } from "./CommentSection";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const post = await fetchPost(id);
  return {
    title: post ? post.title : "Post not found",
  };
}

export default async function PostPage({ params }: Props) {
  const { id } = await params;
  const [post, comments] = await Promise.all([
    fetchPost(id),
    fetchComments(id),
  ]);

  if (!post) notFound();

  return (
    <div className="max-w-3xl mx-auto w-full">
      <PostDetail post={post} />
      <CommentSection postId={post.id} initialComments={comments || []} />
    </div>
  );
}
