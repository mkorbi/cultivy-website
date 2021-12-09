import { GetStaticPropsContext, InferGetStaticPropsType } from 'next';
import ErrorPage from 'next/error';
import Head from 'next/head';
import React, { useEffect } from 'react';
import styled from 'styled-components';
import { staticRequest } from 'tinacms';
import Container from 'components/Container';
import MDXRichText from 'components/MDXRichText';
import { formatDate } from 'utils/formatDate';
import { media } from 'utils/media';
import { getAllPostsSlugs, getSinglePost } from 'utils/postsFetcher';
import { getReadTime } from 'utils/readTime';
import Header from 'views/SingleArticlePage/Header';
import MetadataHead from 'views/SingleArticlePage/MetadataHead';
import OpenGraphHead from 'views/SingleArticlePage/OpenGraphHead';
import ShareWidget from 'views/SingleArticlePage/ShareWidget';
import StructuredDataHead from 'views/SingleArticlePage/StructuredDataHead';
import { PostsDocument, Query } from '.tina/__generated__/types';
import { NonNullableChildrenDeep } from 'types';

export default function SingleArticlePage(props: InferGetStaticPropsType<typeof getStaticProps>) {
  const { slug, content, data, readTime } = props;
  const { title, description, date, tags, imageUrl } = data;
  const meta = { title, description, date: date, tags, imageUrl, author: '' };

  useEffect(() => {
    lazyLoadPrismTheme();

    function lazyLoadPrismTheme() {
      const prismThemeLinkEl = document.querySelector('link[data-id="prism-theme"]');

      if (!prismThemeLinkEl) {
        const headEl = document.querySelector('head');
        if (headEl) {
          const newEl = document.createElement('link');
          newEl.setAttribute('data-id', 'prism-theme');
          newEl.setAttribute('rel', 'stylesheet');
          newEl.setAttribute('href', '/prism-theme.css');
          newEl.setAttribute('media', 'print');
          newEl.setAttribute('onload', "this.media='all'; this.onload=null;");
          headEl.appendChild(newEl);
        }
      }
    }
  }, []);

  if (!date) {
    return <ErrorPage statusCode={404} />;
  }

  const formattedDate = formatDate(new Date(date));

  return (
    <>
      <Head>
        <noscript>
          <link rel="stylesheet" href="/prism-theme.css" />
        </noscript>
      </Head>
      <OpenGraphHead slug={slug} {...meta} />
      <StructuredDataHead slug={slug} {...meta} />
      <MetadataHead {...meta} />
      <CustomContainer id="content">
        <ShareWidget title={title} slug={slug} />
        <Header title={title} formattedDate={formattedDate} imageUrl={imageUrl} readTime={readTime} />
        <MDXRichText {...content} />
      </CustomContainer>
    </>
  );
}

export async function getStaticPaths() {
  const postsListData = await staticRequest({
    query: `
      query PostsSlugs{
        getPostsList{
          edges{
            node{
              sys{
                basename
              }
            }
          }
        }
      }
    `,
    variables: {},
  });

  if (!postsListData) {
    return {
      paths: [],
      fallback: false,
    };
  }

  type NullAwarePostsList = { getPostsList: NonNullableChildrenDeep<Query['getPostsList']> };
  return {
    paths: (postsListData as NullAwarePostsList).getPostsList.edges.map((edge) => ({
      params: { slug: normalizePostName(edge.node.sys.basename) },
    })),
    fallback: false,
  };
}

function normalizePostName(postName: string) {
  return postName.replace('.mdx', '');
}

export async function getStaticProps({ params }: GetStaticPropsContext<{ slug: string }>) {
  if (!params?.slug) {
    return {
      notFound: true,
    };
  }

  const { slug } = params;
  const variables = { relativePath: `${slug}.mdx` };
  const query = `
    query BlogPostQuery($relativePath: String!) {
      getPostsDocument(relativePath: $relativePath) {
        data {
          title
          description
          date
          tags
          imageUrl
          body
        }
      }
    }
  `;

  const data = (await staticRequest({
    query: query,
    variables: variables,
  })) as { getPostsDocument: PostsDocument };

  const { title, description, date, tags, imageUrl, body } = data.getPostsDocument.data;
  const meta = { title, description, date, tags, imageUrl };
  const serializedContent = await serializeContent(body || '', meta);
  return {
    props: { slug, content: serializedContent, readTime: getReadTime(body || ''), variables, query, data: data.getPostsDocument.data },
  };

  async function serializeContent(content: string, meta: Record<string, unknown>) {
    const { serialize } = await import('next-mdx-remote/serialize');
    return serialize(content, {
      scope: meta,
      mdxOptions: {
        remarkPlugins: [
          // @ts-ignore
          await import('@fec/remark-a11y-emoji'),
          await import('remark-breaks'),
          await import('remark-gfm'),
          await import('remark-footnotes'),
          await import('remark-external-links'),
          await import('remark-slug'),
          // @ts-ignore
          await import('remark-sectionize'),
        ],
        rehypePlugins: [],
      },
    });
  }
}

const CustomContainer = styled(Container)`
  position: relative;
  max-width: 90rem;
  margin: 10rem auto;

  ${media('<=tablet')} {
    margin: 5rem auto;
  }
`;
