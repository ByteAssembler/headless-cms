CREATE TABLE "blog_post" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" jsonb NOT NULL,
	"slug" text NOT NULL,
	"content" jsonb NOT NULL,
	"featured_image" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_post_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "blog_post_to_tag" (
	"blog_post_id" uuid NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "blog_post_to_tag_blog_post_id_tag_id_pk" PRIMARY KEY("blog_post_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "tag_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "blog_post" ADD CONSTRAINT "blog_post_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_to_tag" ADD CONSTRAINT "blog_post_to_tag_blog_post_id_blog_post_id_fk" FOREIGN KEY ("blog_post_id") REFERENCES "public"."blog_post"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "blog_post_to_tag" ADD CONSTRAINT "blog_post_to_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "blog_post_title_idx" ON "blog_post" USING btree ("title");--> statement-breakpoint
CREATE INDEX "blog_post_is_published_idx" ON "blog_post" USING btree ("is_published");