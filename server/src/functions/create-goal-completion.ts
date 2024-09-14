import { goalCompletions, goals } from '../db/schema'
import { db } from '../db'
import { and, count, eq, gte, lte, sql } from 'drizzle-orm'
import dayjs from 'dayjs'

interface CreateGoalCompletionRequest {
  goalId: string
}

export async function CreateGoalCompletion({
  goalId,
}: CreateGoalCompletionRequest) {
  const lastDayOfWeek = dayjs().endOf('week').toDate()
  const firstDayOfWeek = dayjs().startOf('week').toDate()
  const goalCompletionCounts = db.$with('goal_completion_counts').as(
    db
      .select({
        goalID: goalCompletions.goalId,
        completionCount: count(goalCompletions.id).as('completionCount'),
      })
      .from(goalCompletions)
      .where(
        and(
          gte(goalCompletions.completedAt, firstDayOfWeek),
          lte(goalCompletions.completedAt, lastDayOfWeek),
          eq(goalCompletions.goalId, goalId)
        )
      )
      .groupBy(goalCompletions.goalId)
  )

  const result = await db
    .with(goalCompletionCounts)
    .select({
      desiredWeeklyFrequency: goals.desiredWeeklyFrequency,
      completionCount: sql /*sql*/`
        COALESCE(${goalCompletionCounts.completionCount}, 0)
      `.mapWith(Number),
    })
    .from(goals)
    .leftJoin(goalCompletionCounts, eq(goalCompletionCounts.goalID, goals.id))
    .where(eq(goals.id, goalId))
    .limit(1)

  const { completionCount, desiredWeeklyFrequency } = result[0]
  if (completionCount >= desiredWeeklyFrequency) {
    throw new Error('Goal already completed')
  }
  const insert = await db
    .insert(goalCompletions)
    .values({
      goalId,
    })
    .returning()

  const goalCompletion = result[0]

  return goalCompletion
}
