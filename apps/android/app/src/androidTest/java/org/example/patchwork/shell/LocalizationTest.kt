package org.example.patchwork.shell

import android.content.Context
import android.content.res.Configuration
import android.os.LocaleList
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.core.os.LocaleListCompat
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class LocalizationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @After fun restoreSystemLanguage() {
        compose.activityRule.scenario.onActivity {
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.getEmptyLocaleList())
        }
        compose.waitForIdle()
    }

    @Test fun languagePickerUpdatesCopyAndSurvivesRecreation() {
        val system = if (android.os.Build.VERSION.SDK_INT >= 33)
            compose.activity.getSystemService(android.app.LocaleManager::class.java).systemLocales else null
        compose.onNodeWithTag("tab.settings").performClick()
        compose.onNodeWithTag("language.es").performScrollTo().performClick()
        compose.onNodeWithText("Idioma").assertIsDisplayed()
        compose.onNodeWithTag("language.es").assertIsSelected()
        compose.activityRule.scenario.recreate()
        compose.onNodeWithText("Idioma").assertIsDisplayed()
        compose.onNodeWithTag("language.es").assertIsSelected()
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            assertEquals(system, compose.activity.getSystemService(android.app.LocaleManager::class.java).systemLocales)
        }
        compose.onNodeWithTag("language.en").performScrollTo().performClick()
        compose.onNodeWithText("Language").assertIsDisplayed()
        compose.onNodeWithTag("language.system").performScrollTo().performClick()
        compose.onNodeWithTag("language.system").assertIsSelected()
        assertTrue(AppCompatDelegate.getApplicationLocales().isEmpty)
    }

    @Test fun bundledCopyAndPluralSelectionUseNativeResourcesWithEnglishFallback() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        fun localized(tag: String): Context {
            val configuration = Configuration(context.resources.configuration)
            configuration.setLocales(LocaleList.forLanguageTags(tag))
            return context.createConfigurationContext(configuration)
        }
        assertEquals("Browse", localized("en").getString(R.string.shell_browse))
        assertEquals("Explorar", localized("es-MX").getString(R.string.shell_browse))
        assertEquals("Browse", localized("fr-FR").getString(R.string.shell_browse))
        for ((tag, expected) in mapOf("en" to listOf("0 results", "1 result", "2 results"),
            "es" to listOf("0 resultados", "1 resultado", "2 resultados"))) {
            for (count in 0..2) {
                assertEquals(expected[count], localized(tag).resources.getQuantityString(
                    R.plurals.discovery_result_count, count, count))
            }
        }
        assertEquals("Patchwork", localized("es").getString(R.string.app_title))
        assertEquals("1000000 resultados", localized("es").resources.getQuantityString(
            R.plurals.discovery_result_count, 1_000_000, 1_000_000))
    }
}
