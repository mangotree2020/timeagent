package com.ontime.accessibility

import android.content.Context
import android.provider.Settings
import android.accessibilityservice.AccessibilityServiceInfo
import android.view.accessibility.AccessibilityManager
import androidx.core.os.bundleOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OnTimeAccessibilityModule : Module() {
  private var touchExplorationListener: AccessibilityManager.TouchExplorationStateChangeListener? = null
  private var accessibilityStateListener: AccessibilityManager.AccessibilityStateChangeListener? = null

  private val accessibilityManager: AccessibilityManager?
    get() = appContext.reactContext
      ?.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager

  private fun isScreenReaderEnabled(): Boolean {
    val context = appContext.reactContext ?: return false
    val manager = accessibilityManager
    val touchExplorationEnabled = manager?.isEnabled == true && manager.isTouchExplorationEnabled
    val spokenServiceEnabled = manager
      ?.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_SPOKEN)
      ?.isNotEmpty() == true
    val secureAccessibilityEnabled = Settings.Secure.getInt(
      context.contentResolver,
      Settings.Secure.ACCESSIBILITY_ENABLED,
      0
    ) == 1
    val enabledServiceNames = Settings.Secure.getString(
      context.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ).orEmpty().lowercase()
    val knownScreenReaderEnabled = secureAccessibilityEnabled && listOf(
      "talkback",
      "screenreader",
      "screen_reader",
      "voiceassistant",
      "voice_assistant"
    ).any(enabledServiceNames::contains)

    return touchExplorationEnabled || spokenServiceEnabled || knownScreenReaderEnabled
  }

  override fun definition() = ModuleDefinition {
    Name("OnTimeAccessibility")

    Events("onScreenReaderChanged")

    Function("isScreenReaderEnabled") {
      isScreenReaderEnabled()
    }

    OnStartObserving("onScreenReaderChanged") {
      val manager = accessibilityManager ?: return@OnStartObserving
      val listener = AccessibilityManager.TouchExplorationStateChangeListener {
        emitScreenReaderState()
      }
      touchExplorationListener = listener
      manager.addTouchExplorationStateChangeListener(listener)
      val serviceListener = AccessibilityManager.AccessibilityStateChangeListener {
        emitScreenReaderState()
      }
      accessibilityStateListener = serviceListener
      manager.addAccessibilityStateChangeListener(serviceListener)
      emitScreenReaderState()
    }

    OnStopObserving("onScreenReaderChanged") {
      touchExplorationListener?.let { accessibilityManager?.removeTouchExplorationStateChangeListener(it) }
      touchExplorationListener = null
      accessibilityStateListener?.let { accessibilityManager?.removeAccessibilityStateChangeListener(it) }
      accessibilityStateListener = null
    }
  }

  private fun emitScreenReaderState() {
    sendEvent(
      "onScreenReaderChanged",
      bundleOf("enabled" to isScreenReaderEnabled())
    )
  }
}
