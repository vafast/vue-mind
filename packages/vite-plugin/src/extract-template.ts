/**
 * 从 Vue SFC 的 <template> 中提取交互元素和导航信息
 *
 * 分析模板 AST，找出：
 * - 绑定了事件的元素（@click, @input 等）→ 用户可交互的操作点
 * - <router-link> / <RouterLink> → 可导航的路由
 */

import { parse as parseSFC } from '@vue/compiler-sfc'
import { parse as parseDom, NodeTypes } from '@vue/compiler-dom'
import type {
  TemplateChildNode,
  ElementNode,
  DirectiveNode,
  AttributeNode,
  SimpleExpressionNode,
} from '@vue/compiler-dom'
import type { InteractionMeta, NavigationMeta } from '@vue-mind/shared'

export function extractTemplateMeta(source: string, filename: string) {
  const { descriptor } = parseSFC(source, { filename })
  if (!descriptor.template) return { interactions: [], navigations: [] }

  const templateAst = parseDom(descriptor.template.content)
  const interactions: InteractionMeta[] = []
  const navigations: NavigationMeta[] = []

  walkNode(templateAst.children, interactions, navigations)
  return { interactions, navigations }
}

function isSimpleExpression(node: unknown): node is SimpleExpressionNode {
  return !!node && typeof node === 'object' && (node as { type: number }).type === NodeTypes.SIMPLE_EXPRESSION
}

function walkNode(
  nodes: TemplateChildNode[],
  interactions: InteractionMeta[],
  navigations: NavigationMeta[]
) {
  for (const node of nodes) {
    if (node.type !== NodeTypes.ELEMENT) continue
    const el = node as ElementNode

    // 提取事件绑定 (@click, @input 等)
    for (const prop of el.props) {
      if (prop.type === NodeTypes.DIRECTIVE && (prop as DirectiveNode).name === 'on') {
        const dir = prop as DirectiveNode
        const event = isSimpleExpression(dir.arg) ? dir.arg.content : 'unknown'
        const handler = isSimpleExpression(dir.exp) ? dir.exp.content : 'unknown'
        interactions.push({ element: describeElement(el), event, handler })
      }
    }

    // 提取 router-link 导航
    if (el.tag === 'router-link' || el.tag === 'RouterLink') {
      const toProp = el.props.find(
        p =>
          (p.type === NodeTypes.ATTRIBUTE && (p as AttributeNode).name === 'to') ||
          (p.type === NodeTypes.DIRECTIVE && isSimpleExpression((p as DirectiveNode).arg) && ((p as DirectiveNode).arg as SimpleExpressionNode).content === 'to')
      )
      if (toProp) {
        const path =
          toProp.type === NodeTypes.ATTRIBUTE
            ? (toProp as AttributeNode).value?.content || ''
            : isSimpleExpression((toProp as DirectiveNode).exp)
              ? ((toProp as DirectiveNode).exp as SimpleExpressionNode).content
              : ''
        if (path) navigations.push({ path, label: getTextContent(el) })
      }
    }

    if (el.children) walkNode(el.children, interactions, navigations)
  }
}

function describeElement(el: ElementNode): string {
  const tag = el.tag
  const typeProp = el.props.find(p => p.type === NodeTypes.ATTRIBUTE && (p as AttributeNode).name === 'type')
  const typeVal = typeProp?.type === NodeTypes.ATTRIBUTE ? (typeProp as AttributeNode).value?.content : ''

  if (tag === 'button') return 'button'
  if (tag === 'input' && typeVal) return `input[type=${typeVal}]`
  if (tag === 'input') return 'input'
  if (tag === 'select') return 'select'
  if (tag === 'a') return 'link'
  if (tag[0] === tag[0]!.toUpperCase()) return tag
  return tag
}

function getTextContent(el: ElementNode): string | undefined {
  const texts: string[] = []
  for (const child of el.children) {
    if (child.type === NodeTypes.TEXT) texts.push(child.content.trim())
  }
  return texts.join(' ').trim() || undefined
}
