import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Document } from '../types'
import { useAuth } from './useAuth'

export function useDocuments() {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDocuments = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (!error && data) setDocuments(data as Document[])
    setLoading(false)
  }, [user])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  const updateStatus = async (id: string, statut: Document['statut']) => {
    await supabase.from('documents').update({ statut }).eq('id', id)
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, statut } : d))
  }

  const deleteDocument = async (id: string) => {
    const doc = documents.find(d => d.id === id)
    if (doc?.url_fichier && user) {
      const segments = doc.url_fichier.split('/')
      const filename = segments[segments.length - 1]
      await supabase.storage.from('documents').remove([`${user.id}/${filename}`])
    }
    await supabase.from('documents').delete().eq('id', id)
    setDocuments(prev => prev.filter(d => d.id !== id))
  }

  const now = new Date()
  const thisMonthDeadlines = documents.filter(d => {
    if (!d.date_limite || d.statut === 'archive') return false
    const dl = new Date(d.date_limite)
    return dl.getMonth() === now.getMonth() && dl.getFullYear() === now.getFullYear()
  }).length

  const urgentCount = documents.filter(d => d.urgence && d.statut !== 'archive').length

  const upcomingDeadlines = documents
    .filter(d => d.date_limite && d.statut !== 'archive' && new Date(d.date_limite) >= now)
    .sort((a, b) => new Date(a.date_limite!).getTime() - new Date(b.date_limite!).getTime())
    .slice(0, 3)

  const recentDocuments = documents.slice(0, 5)

  return {
    documents,
    loading,
    fetchDocuments,
    updateStatus,
    deleteDocument,
    thisMonthDeadlines,
    urgentCount,
    upcomingDeadlines,
    recentDocuments,
  }
}
